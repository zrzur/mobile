/**
 * The one call this phone is in (web: rtc/state.tsx, the Voice class).
 *
 * Lives outside React so the call goes on while screens change. Screens
 * read `callStore` with `useStore` and act through `call`. Everything that
 * needs native code goes through `voiceRuntime()`; without it a join ends
 * with the "unavailable" error and nothing else changes.
 */
import type { Channel, Client } from "@zrzur/sdk/solid";
import { applyStageChange, fetchSoundboard, fetchStage, playSound, type SoundboardSound, type StageState } from "@zrzur/sdk/solid/voiceExtras";
import { createAudioPlayer, requestRecordingPermissionsAsync } from "expo-audio";
import { requestCameraPermissionsAsync } from "expo-image-picker";
import type { LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, Track, VideoTrack } from "livekit-client";
import { PermissionsAndroid, Platform } from "react-native";
import { createComputed, createRoot } from "solid-js";

import { explainPermission, type PermissionOutcome, permissionOutcome } from "@/lib/permissions";
import { secureStorage } from "@/lib/secureStorage";
import { playSound as playCue, type SoundKey } from "@/sounds";
import { readPrefs, VOICE_DEFAULTS, VOICE_KEY, type VoicePrefs } from "@/ui/settings/user/userPrefs";

import {
  allowedVoiceUrl,
  canRetryRejoin,
  canSpeak,
  captureOptions,
  defaultRoute,
  livekitHealthUrl,
  microphoneOpen,
  NOTICE_MS,
  type OutputRoute,
  outputRoutes,
  playbackVolume,
  REJOIN_DELAYS,
  routeDevice,
  sameList,
  soundGain,
  soundUrl,
  SpeakingThrottle,
  type VoiceErrorKind,
  voiceErrorKind,
} from "./logic";
import { voiceRuntime, type VoiceRuntime } from "./native";
import { type ConnectionQualityName, GOOD_NETWORK, type NetworkLevel, type NetworkState, nextNetworkState, qualityWarn, rateQuality, remoteVideoFor } from "./network";
import { clearOutgoingRing, rings, startOutgoingRing } from "./ringing";
import { createStore } from "./store";
import { clampVolume, NO_VOLUMES, type PersonVolumes, personVolume, readVolumes, VOLUMES_KEY } from "./volumes";

export type CallStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

/** One person's tile */
export type Tile = {
  id: string;
  local: boolean;
  camera: boolean;
  screen: boolean;
  micMuted: boolean;
  /** Their connection is weak or lost (pointed out on the tile) */
  weak?: "weak" | "lost";
};

export type CallNotice = "reconnected" | "declined" | "missed";

export type CallSnapshot = {
  status: CallStatus;
  channelId?: string;
  /** When this call was joined (ms) */
  startedAt?: number;
  /** The saved choices, kept between calls (web: state.voice) */
  micOn: boolean;
  deafen: boolean;
  camera: boolean;
  screenshare: boolean;
  facing: "user" | "environment";
  tiles: Tile[];
  /** Ids of who is speaking now (throttled) */
  speaking: string[];
  output: OutputRoute;
  outputs: OutputRoute[];
  error?: VoiceErrorKind;
  canRejoin: boolean;
  notice?: { kind: CallNotice; name?: string };
  /** What the member may do here (follows roles, moderation and a stage seat) */
  canSpeak: boolean;
  canListen: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  canVideo: boolean;
  /** A stage's live state (stage channels only) */
  stage?: StageState;
  /** "Connected" shows for a few seconds after (re)connecting, then fades (web: FadeOut) */
  justConnected: boolean;
  /** How this phone's connection holds up (web: voice.network()) */
  network: NetworkLevel;
  /** Per-person and per-stream volume, kept on this device */
  volumes: PersonVolumes;
};

const IDLE: CallSnapshot = {
  status: "idle",
  micOn: true,
  deafen: false,
  camera: false,
  screenshare: false,
  facing: "user",
  tiles: [],
  speaking: [],
  output: "speaker",
  outputs: ["speaker"],
  canRejoin: true,
  canSpeak: true,
  canListen: true,
  serverMuted: false,
  serverDeafened: false,
  canVideo: true,
  justConnected: false,
  network: "good",
  volumes: NO_VOLUMES,
};

export const callStore = createStore<CallSnapshot>(IDLE);

function patch(change: Partial<CallSnapshot>) {
  callStore.set((s) => ({ ...s, ...change }));
}

type Auth = { url: string; token: string };

/** Sounds of the server the call is in, for sounds others play */
type SoundEntry = Pick<SoundboardSound, "_id" | "volume">;

class CallController {
  #client: Client | undefined;
  #rt: VoiceRuntime | null | undefined;
  #room: Room | undefined;
  #channel: Channel | undefined;
  #attempt = 0;
  #prefs: VoicePrefs = { ...VOICE_DEFAULTS };
  #disposeWatch: (() => void) | undefined;
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  #wake: (() => void) | undefined;
  #speaking = new SpeakingThrottle((ids) => patch({ speaking: ids }));
  #sounds = new Map<string, SoundEntry>();
  #shown = { channel: "", muted: false, deafened: false };
  #network: NetworkState = GOOD_NETWORK;
  #networkTimer: ReturnType<typeof setInterval> | undefined;
  #connectedTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set by the overlay: open the room a room maker handed out */
  onRoomMade: ((channel: Channel) => void) | undefined;

  /** The SDK client the call belongs to (the overlay sets it) */
  attach(client: Client) {
    this.#client = client;
    const onMove = (move: { node: string; from: string; to: string; token: string }) => {
      if (this.#channel?.id !== move.from) return;
      const channel = client.channels.get(move.to);
      const node = client.configuration?.features.livekit.nodes.find((n) => n.name === move.node);
      if (!channel || !node || !move.token) {
        this.leave();
        return;
      }
      void this.join(channel, { auth: { url: node.public_url, token: move.token } });
      this.onRoomMade?.(channel);
    };
    const onLeave = (channelId: string, userId: string) => {
      if (userId !== client.user?.id || this.#channel?.id !== channelId) return;
      const state = callStore.get().status;
      if (state !== "reconnecting" && (!this.#room || this.#room.state === "disconnected")) this.leave();
    };
    const onVoiceEvent = (event: { type: string } & Record<string, unknown>) => this.#voiceEvent(event);
    const onLogout = () => this.leave();
    const onReady = () => {
      // events missed while the gateway was down: ask for the stage again
      const channel = this.#channel;
      if (channel?.isStage) void this.#loadStage(channel);
    };
    client.on("userMoveVoiceChannel", onMove);
    client.on("voiceChannelLeave", onLeave);
    client.on("voiceEvent", onVoiceEvent as never);
    client.on("logout", onLogout);
    client.on("ready", onReady);
    return () => {
      client.off("userMoveVoiceChannel", onMove);
      client.off("voiceChannelLeave", onLeave);
      client.off("voiceEvent", onVoiceEvent as never);
      client.off("logout", onLogout);
      client.off("ready", onReady);
    };
  }

  get room() {
    return this.#room;
  }

  get channel() {
    return this.#channel;
  }

  /** Whether this build can make calls at all */
  available(): boolean {
    this.#rt ??= voiceRuntime();
    return !!this.#rt;
  }

  /**
   * Join a voice channel, DM or group call.
   * @param options.auth Token already issued (a move)
   * @param options.roomMaker The channel hands out rooms: ask for one first
   * @param options.video Camera on once connected (accept with video)
   */
  async join(
    target: Channel,
    options: { auth?: Auth; previousSession?: string; retry?: number; roomMaker?: boolean; video?: boolean } = {},
  ): Promise<void> {
    const client = this.#client;
    if (!client) return;
    let channel = target;
    this.#rt ??= voiceRuntime();
    const rt = this.#rt;
    if (!rt) {
      patch({ error: "unavailable", channelId: undefined, status: "idle" });
      return;
    }

    if (options.roomMaker && !options.auth && !options.previousSession) {
      try {
        const room = (await client.api.post(`/channels/${channel.id as ""}/rooms` as never)) as { _id: string };
        channel = client.channels.getOrCreate(room._id, room as never);
        this.onRoomMade?.(channel);
      } catch (error) {
        patch({ error: voiceErrorKind(error) });
        return;
      }
    }

    const rejoining = !!options.previousSession;
    this.#teardown(true);
    const attempt = ++this.#attempt;
    this.#channel = channel;
    patch({
      status: rejoining ? "reconnecting" : "connecting",
      channelId: channel.id,
      startedAt: rejoining ? callStore.get().startedAt : Date.now(),
      error: undefined,
      canRejoin: true,
      camera: false,
      screenshare: false,
      tiles: [],
      speaking: [],
      ...(rejoining ? {} : { stage: undefined }),
    });

    this.#prefs = await secureStorage
      .get(VOICE_KEY)
      .then((raw) => readPrefs(raw, VOICE_DEFAULTS))
      .catch(() => ({ ...VOICE_DEFAULTS }));
    const volumes = await secureStorage
      .get(VOLUMES_KEY)
      .then(readVolumes)
      .catch(() => NO_VOLUMES);
    if (attempt !== this.#attempt) return;
    patch({ volumes });

    if (!(await this.#askMicrophone())) {
      // no microphone: join to listen, muted
      patch({ micOn: false });
    }
    if (attempt !== this.#attempt) return;

    const authRequest = options.auth ? Promise.resolve(options.auth) : this.#requestAuth(channel, options.previousSession);
    authRequest.catch(() => undefined);

    const dm = channel.type === "DirectMessage" || channel.type === "Group";
    const route = rejoining ? callStore.get().output : defaultRoute(dm);
    try {
      await this.#configureAudio(rt, route);
      await rt.rn.AudioSession.startAudioSession();
    } catch (error) {
      console.warn("[voice] audio session not started", error);
    }
    if (attempt !== this.#attempt) return;

    const capture = captureOptions(this.#prefs);
    const room = new rt.lk.Room({
      adaptiveStream: { pixelDensity: "screen" },
      dynacast: true,
      audioCaptureDefaults: capture,
      videoCaptureDefaults: { facingMode: callStore.get().facing, resolution: rt.lk.VideoPresets.h720.resolution },
      publishDefaults: {
        videoEncoding: rt.lk.VideoPresets.h720.encoding,
        screenShareEncoding: rt.lk.ScreenSharePresets.h720fps15.encoding,
        audioPreset: this.#prefs.highQuality ? rt.lk.AudioPresets.musicHighQuality : rt.lk.AudioPresets.speech,
        dtx: !this.#prefs.highQuality,
        red: true,
      },
    });
    this.#room = room;
    this.#listen(rt, room, channel);
    this.#watch(channel);
    if (channel.isStage) void this.#loadStage(channel);
    if (channel.server) void this.#loadSounds(channel);

    try {
      const auth = await authRequest;
      if (attempt !== this.#attempt) return;
      if (!auth.token || !auth.url) throw new Error("Missing voice connection token");
      if (!allowedVoiceUrl(auth.url, __DEV__)) throw new Error("Voice server address not allowed");
      await room.connect(auth.url, auth.token, { autoSubscribe: true });
      if (attempt !== this.#attempt) return;
      this.#connected();
      if (rejoining) this.#notice({ kind: "reconnected" });
      else this.#cue("userJoinVoice");
      this.#watchNetwork(room);
      await this.#applyMicrophone();
      if (options.video) void this.toggleCamera();
      if (!rejoining) this.#ringOthers(room, channel);
      void this.#refreshOutputs();
      this.#rebuild();
    } catch (error) {
      console.warn("[voice] join failed", error);
      if (attempt !== this.#attempt) return;
      room.removeAllListeners();
      await room.disconnect().catch(() => undefined);
      const retry = options.retry ?? 0;
      if (options.previousSession && retry < REJOIN_DELAYS.length && canRetryRejoin(error)) {
        patch({ status: "reconnecting" });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, REJOIN_DELAYS[retry]);
          this.#wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        this.#wake = undefined;
        if (attempt !== this.#attempt) return;
        return this.join(channel, { previousSession: options.previousSession, retry: retry + 1 });
      }
      if (!options.previousSession) {
        // a first join that failed: back to the lobby with the reason and Try again
        this.leave();
        patch({ channelId: channel.id, error: voiceErrorKind(error) });
        return;
      }
      patch({ status: "disconnected", canRejoin: canRetryRejoin(error), error: voiceErrorKind(error) });
    }
  }

  /** The network is back: try the next rejoin now */
  networkBack() {
    this.#wake?.();
  }

  /** Join the same channel again after the call gave up reconnecting */
  rejoin() {
    const channel = this.#channel;
    const s = callStore.get();
    if (channel && s.status === "disconnected" && s.canRejoin) void this.join(channel);
  }

  /** Leave the call */
  leave() {
    if (callStore.get().status === "connected") this.#cue("userLeaveVoice");
    this.#teardown(false);
    const keep = callStore.get();
    patch({
      ...IDLE,
      channelId: undefined,
      startedAt: undefined,
      error: undefined,
      notice: undefined,
      stage: undefined,
      micOn: keep.micOn,
      deafen: keep.deafen,
      facing: keep.facing,
      output: keep.output,
      volumes: keep.volumes,
    });
  }

  /** Clear the error a failed join left (the lobby shows Join again) */
  clearError() {
    if (callStore.get().status === "idle" || callStore.get().status === "disconnected") patch({ error: undefined });
  }

  #teardown(keepChannel: boolean) {
    ++this.#attempt;
    clearOutgoingRing();
    clearTimeout(this.#noticeTimer);
    clearInterval(this.#networkTimer);
    clearTimeout(this.#connectedTimer);
    this.#networkTimer = undefined;
    this.#network = GOOD_NETWORK;
    if (callStore.get().network !== "good") patch({ network: "good" });
    this.#speaking.clear();
    this.#disposeWatch?.();
    this.#disposeWatch = undefined;
    const room = this.#room;
    this.#room = undefined;
    if (room) {
      room.removeAllListeners();
      void room.disconnect().catch(() => undefined);
      // drop ourselves from the roster at once instead of waiting for the event
      const self = this.#client?.user?.id;
      if (self) this.#channel?.voiceParticipants.delete(self);
      void this.#rt?.rn.AudioSession.stopAudioSession().catch(() => undefined);
    }
    if (!keepChannel) this.#channel = undefined;
    this.#shown = { channel: "", muted: false, deafened: false };
  }

  // --- controls ---------------------------------------------------------------

  async toggleMute() {
    const s = callStore.get();
    if (s.deafen) {
      // unmuting while deafened undeafens too (web)
      patch({ deafen: false, micOn: true });
      await this.#applyMicrophone();
      this.#applyVolume();
      return;
    }
    if (this.#room?.state !== "connected") {
      patch({ micOn: !s.micOn });
      return;
    }
    if (!s.canSpeak) return;
    patch({ micOn: !s.micOn });
    this.#cue(s.micOn ? "mute" : "unmute");
    await this.#applyMicrophone();
  }

  async toggleDeafen() {
    const s = callStore.get();
    if (!s.canListen && !s.deafen) return;
    patch({ deafen: !s.deafen });
    if (this.#room?.state === "connected") this.#cue(s.deafen ? "undeafen" : "deafen");
    this.#applyVolume();
    await this.#applyMicrophone();
  }

  async toggleCamera() {
    const room = this.#room;
    if (!room || room.state !== "connected") return;
    const on = room.localParticipant.isCameraEnabled;
    if (!on && !callStore.get().canVideo) return;
    try {
      if (!on && !(await this.#askCamera())) throw Object.assign(new Error("camera"), { name: "NotAllowedError" });
      await room.localParticipant.setCameraEnabled(!on, { facingMode: callStore.get().facing });
      patch({ camera: room.localParticipant.isCameraEnabled });
      this.#rebuild();
    } catch (error) {
      this.#actionError(error);
    }
  }

  /** Front or back camera */
  async flipCamera() {
    const facing = callStore.get().facing === "user" ? "environment" : "user";
    patch({ facing });
    const track = this.#room?.localParticipant.getTrackPublication("camera" as Track.Source)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    try {
      await track.restartTrack({ facingMode: facing });
    } catch (error) {
      console.warn("[voice] camera not switched", error);
    }
  }

  /**
   * Share the screen. Android: a MediaProjection prompt and a foreground
   * service (the LiveKit plugin's). The bar offers it on Android only: iOS
   * needs a broadcast extension target first (see the report).
   */
  async toggleScreenshare() {
    const room = this.#room;
    if (!room || room.state !== "connected") return;
    const on = room.localParticipant.isScreenShareEnabled;
    if (!on && !callStore.get().canVideo) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!on);
      patch({ screenshare: room.localParticipant.isScreenShareEnabled });
      this.#rebuild();
    } catch (error) {
      // the person said no to the system prompt: nothing to show
      if ((error as Error)?.name !== "NotAllowedError") this.#actionError(error);
    }
  }

  /** Where the sound goes */
  async selectOutput(route: OutputRoute) {
    const rt = this.#rt;
    if (!rt) return;
    const device = routeDevice(Platform.OS, route);
    try {
      if (device === "picker") await rt.rn.AudioSession.showAudioRoutePicker();
      else await rt.rn.AudioSession.selectAudioOutput(device);
      patch({ output: route });
    } catch (error) {
      console.warn("[voice] output not changed", error);
    }
  }

  /** The call's audio session (iOS playAndRecord / voiceChat, Android communication) */
  async #configureAudio(rt: VoiceRuntime, route: OutputRoute) {
    await rt.rn.AudioSession.configureAudio({
      android: {
        preferredOutputList: route === "earpiece" ? ["bluetooth", "headset", "earpiece", "speaker"] : ["bluetooth", "headset", "speaker", "earpiece"],
        audioTypeOptions: rt.rn.AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: route === "earpiece" ? "earpiece" : "speaker" },
    });
  }

  /**
   * Set the call's audio session again after other audio used it (a voice
   * note or video played during the call): expo-audio may have changed the
   * session category, which moves the call to the speaker or mutes its mic.
   */
  async restoreAudioSession() {
    const rt = this.#rt;
    const s = callStore.get();
    if (!rt || s.status === "idle" || s.status === "disconnected") return;
    try {
      await this.#configureAudio(rt, s.output);
      if (s.output !== "speaker" && s.output !== "earpiece") await this.selectOutput(s.output);
    } catch (error) {
      console.warn("[voice] audio session not restored", error);
    }
  }

  async #refreshOutputs() {
    const rt = this.#rt;
    if (!rt) return;
    try {
      const reported = await rt.rn.AudioSession.getAudioOutputs();
      const outputs = outputRoutes(Platform.OS, reported);
      const s = callStore.get();
      patch({ outputs, output: outputs.includes(s.output) ? s.output : outputs[0] });
    } catch {
      // the default list stays
    }
  }

  /** Refresh the output list (the picker opens) */
  refreshOutputs() {
    void this.#refreshOutputs();
  }

  /** The video track of a tile, for VideoView */
  videoTrack(id: string, source: "camera" | "screen"): VideoTrack | undefined {
    const room = this.#room;
    if (!room) return;
    const participant: Participant | undefined = room.localParticipant.identity === id ? room.localParticipant : room.remoteParticipants.get(id);
    const publication = participant?.getTrackPublication((source === "camera" ? "camera" : "screen_share") as Track.Source);
    if (!publication || publication.isMuted) return;
    return publication.track as VideoTrack | undefined;
  }

  /** Play a soundboard sound into this call (needs Use Soundboard and Speak) */
  async playSound(soundId: string) {
    const client = this.#client;
    const channel = this.#channel;
    if (!client || !channel) return;
    await playSound(client, channel, soundId);
  }

  /** A stage action answered with the whole state: show it at once */
  setStage(state: StageState) {
    patch({ stage: state });
    void this.#applyMicrophone();
  }

  // --- per-person volume -------------------------------------------------------

  /** A person's voice for me: 0 to 3 (300 %) */
  setPersonVolume(userId: string, volume: number) {
    this.#saveVolumes((v) => ({ ...v, users: { ...v.users, [userId]: clampVolume(volume) } }));
  }

  /** Mute or unmute a person for me only */
  setPersonMuted(userId: string, muted: boolean) {
    this.#saveVolumes((v) => {
      const next = { ...v.muted };
      if (muted) next[userId] = true;
      else delete next[userId];
      return { ...v, muted: next };
    });
  }

  /** A person's stream sound for me: 0 to 3 */
  setStreamVolume(userId: string, volume: number) {
    this.#saveVolumes((v) => ({ ...v, streams: { ...v.streams, [userId]: clampVolume(volume) } }));
  }

  #saveVolumes(change: (current: PersonVolumes) => PersonVolumes) {
    const volumes = change(callStore.get().volumes);
    patch({ volumes });
    this.#applyVolume();
    void secureStorage.set(VOLUMES_KEY, JSON.stringify(volumes)).catch(() => undefined);
  }

  // --- internals ---------------------------------------------------------------

  /** Connected (again): say so for 5 s */
  #connected() {
    clearTimeout(this.#connectedTimer);
    patch({ status: "connected", justConnected: true });
    this.#connectedTimer = setTimeout(() => patch({ justConnected: false }), 5000);
  }

  /** A short sound of the call (switches in Notifications > Sounds) */
  #cue(key: SoundKey) {
    playCue(key, true);
  }

  /**
   * Rate this phone's connection every 2 s from LiveKit's connection
   * quality, and lower or pause others' video while it is weak (web:
   * weakNetworkWatch). The sign over the tiles reads `network`.
   */
  #watchNetwork(room: Room) {
    clearInterval(this.#networkTimer);
    this.#network = GOOD_NETWORK;
    this.#networkTimer = setInterval(() => {
      if (this.#room !== room || room.state !== "connected") return;
      const before = this.#network.level;
      this.#network = nextNetworkState(this.#network, rateQuality(room.localParticipant.connectionQuality as ConnectionQualityName), Date.now());
      if (this.#network.level === before) return;
      patch({ network: this.#network.level });
      for (const participant of room.remoteParticipants.values()) for (const publication of participant.videoTrackPublications.values()) this.#applyNetworkTo(publication);
    }, 2000);
  }

  /**
   * Others' video at the connection's level: as shown (adaptive stream
   * decides again), lowest quality, or paused. Called on a level change and
   * for video that arrives while the level is not good.
   */
  #applyNetworkTo(publication: RemoteTrackPublication) {
    if (publication.kind !== "video") return;
    const plan = remoteVideoFor(this.#network.level);
    const quality = this.#rt?.lk.VideoQuality;
    try {
      publication.setEnabled(plan !== "off");
      if (quality && plan !== "off") publication.setVideoQuality(plan === "low" ? quality.LOW : quality.HIGH);
    } catch {
      // a track that just ended
    }
  }

  /**
   * Ask for the microphone before joining, on both platforms (iOS used to
   * get the system prompt mid-connect from WebRTC, with no context). A
   * refusal joins muted and says so, with "Open settings" when the system
   * will not ask again. Android 12+ also asks for nearby devices, so
   * Bluetooth headsets can be listed and used.
   */
  async #askMicrophone(): Promise<boolean> {
    let outcome: PermissionOutcome;
    try {
      outcome = permissionOutcome(await requestRecordingPermissionsAsync());
    } catch {
      return false;
    }
    if (outcome !== "granted") explainPermission("microphone-call", outcome);
    if (Platform.OS === "android" && Number(Platform.Version) >= 31) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT).catch(() => undefined);
    }
    return outcome === "granted";
  }

  /** Ask for the camera before the first video, on both platforms; explain a blocked camera */
  async #askCamera(): Promise<boolean> {
    let outcome: PermissionOutcome;
    try {
      outcome = permissionOutcome(await requestCameraPermissionsAsync());
    } catch {
      return false;
    }
    if (outcome === "blocked") explainPermission("camera-call", outcome);
    return outcome === "granted";
  }

  async #requestAuth(channel: Channel, previousSession?: string): Promise<Auth> {
    const client = this.#client!;
    const nodes = client.configuration?.features.livekit.nodes ?? [];
    if (!client.configuration?.features.livekit.enabled || !nodes.length) throw JSON.stringify({ type: "VoiceUnavailable" });
    const selected =
      nodes.length === 1
        ? nodes[0].name
        : await Promise.any(
            nodes.map(async (node) => {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 5000);
              try {
                const response = await fetch(livekitHealthUrl(node.public_url), { signal: controller.signal });
                if (!response.ok) throw new Error("Voice node unavailable");
                return node.name;
              } finally {
                clearTimeout(timer);
              }
            }),
          );
    if (!previousSession) return (await channel.joinCall(selected)) as Auth;
    try {
      return (await client.api.post(`/channels/${channel.id as ""}/join_call`, {
        node: selected,
        force_disconnect: true,
        previous_session: previousSession,
      } as never)) as Auth;
    } catch (error) {
      const type = (error as { type?: string })?.type;
      if (error instanceof TypeError || type === "RateLimited" || type === "AlreadyConnected") throw error;
      throw JSON.stringify({ type: "VoiceRejoinRefused" });
    }
  }

  #listen(rt: VoiceRuntime, room: Room, channel: Channel) {
    const E = rt.lk.RoomEvent;
    const rebuild = () => this.#rebuild();
    room.on(E.ParticipantConnected, () => {
      this.#cue("userJoinVoice");
      rebuild();
    });
    room.on(E.ParticipantDisconnected, () => {
      this.#cue("userLeaveVoice");
      rebuild();
    });
    room.on(E.TrackSubscribed, (track: RemoteTrack, publication?: RemoteTrackPublication, participant?: RemoteParticipant) => {
      if (track.kind === "audio") this.#applyVolumeTo(track, participant?.identity, publication?.source);
      else if (publication && this.#network.level !== "good") this.#applyNetworkTo(publication);
      rebuild();
    });
    room.on(E.ConnectionQualityChanged, rebuild);
    room.on(E.TrackUnsubscribed, rebuild);
    room.on(E.TrackMuted, rebuild);
    room.on(E.TrackUnmuted, rebuild);
    room.on(E.TrackPublished, rebuild);
    room.on(E.TrackUnpublished, rebuild);
    room.on(E.LocalTrackPublished, rebuild);
    room.on(E.LocalTrackUnpublished, () => {
      patch({ camera: room.localParticipant.isCameraEnabled, screenshare: room.localParticipant.isScreenShareEnabled });
      rebuild();
    });
    room.on(E.ActiveSpeakersChanged, (speakers: Participant[]) => this.#speaking.push(speakers.map((p) => p.identity)));
    room.on(E.Disconnected, (reason?: number) => {
      if (this.#room !== room) return;
      if (reason === rt.lk.DisconnectReason.PARTICIPANT_REMOVED) {
        this.leave();
        return;
      }
      patch({ status: "disconnected", canRejoin: reason !== rt.lk.DisconnectReason.DUPLICATE_IDENTITY });
    });
    // LiveKit's own resume reuses the first token: rejoin through join_call
    // with this device's session instead, so the server can refuse when the
    // seat moved to another device (web)
    const rejoin = () => {
      if (this.#room !== room) return;
      const session = room.localParticipant.sid;
      if (!session) return patch({ status: "reconnecting" });
      void this.join(channel, { previousSession: session });
    };
    room.on(E.SignalReconnecting, rejoin);
    room.on(E.Reconnecting, rejoin);
    room.on(E.Reconnected, () => {
      this.#connected();
      this.#notice({ kind: "reconnected" });
    });
    room.on(E.MediaDevicesChanged, () => void this.#refreshOutputs());
  }

  /** Follow permissions, moderation and the roster from the SDK (Solid) */
  #watch(channel: Channel) {
    const client = this.#client!;
    this.#disposeWatch?.();
    this.#disposeWatch = createRoot((dispose) => {
      createComputed(() => {
        const self = client.user?.id;
        const member = channel.serverId && self ? client.serverMembers.getByKey({ server: channel.serverId, user: self }) : undefined;
        const serverMuted = member?.canPublish === false;
        const serverDeafened = member?.canReceive === false;
        const next = {
          serverMuted,
          serverDeafened,
          canListen: channel.havePermission("Listen") && !serverDeafened,
          canVideo: channel.havePermission("Video") && client.limits?.video !== false,
          speakPermission: channel.havePermission("Speak"),
        };
        const s = callStore.get();
        const speak = canSpeak({ speakPermission: next.speakPermission, serverMuted, stage: channel.isStage, stageSpeaker: !!self && !!s.stage?.speakers.includes(self) });
        if (
          s.serverMuted !== serverMuted ||
          s.serverDeafened !== serverDeafened ||
          s.canListen !== next.canListen ||
          s.canVideo !== next.canVideo ||
          s.canSpeak !== speak
        ) {
          patch({ serverMuted, serverDeafened, canListen: next.canListen, canVideo: next.canVideo, canSpeak: speak });
          void this.#applyMicrophone();
          this.#applyVolume();
        }
      });
      // someone else joined a DM call: it is answered
      createComputed(() => {
        const self = client.user?.id;
        const others = [...channel.voiceParticipants.keys()].some((id) => id !== self);
        if (others) clearOutgoingRing(channel.id);
      });
      return dispose;
    });
  }

  /** Recompute the speak permission after a stage change */
  #recheckSpeak() {
    const channel = this.#channel;
    const client = this.#client;
    if (!channel || !client) return;
    const self = client.user?.id;
    const s = callStore.get();
    const speak = canSpeak({
      speakPermission: channel.havePermission("Speak"),
      serverMuted: s.serverMuted,
      stage: channel.isStage,
      stageSpeaker: !!self && !!s.stage?.speakers.includes(self),
    });
    if (speak !== s.canSpeak) patch({ canSpeak: speak });
  }

  async #applyMicrophone() {
    this.#recheckSpeak();
    const room = this.#room;
    const s = callStore.get();
    this.#reportState();
    if (!room || room.state !== "connected") return;
    const open = microphoneOpen({ micOn: s.micOn, deafen: s.deafen, canSpeak: s.canSpeak });
    try {
      await room.localParticipant.setMicrophoneEnabled(open, captureOptions(this.#prefs));
    } catch (error) {
      if (open) {
        patch({ micOn: false });
        this.#actionError(error);
      }
    }
    this.#rebuild();
  }

  /**
   * The voice server does not report a mute or a deafen: tell the API, so
   * people outside the call see it (web: voice_state)
   */
  #reportState(attempt = 0) {
    const client = this.#client;
    const channel = this.#channel;
    const s = callStore.get();
    if (!client || !channel || s.status !== "connected") return;
    const muted = !s.micOn;
    const deafened = s.deafen;
    const before = this.#shown.channel === channel.id ? this.#shown : { channel: channel.id, muted: false, deafened: false };
    if (attempt === 0 && before.muted === muted && before.deafened === deafened && this.#shown.channel === channel.id) return;
    this.#shown = { channel: channel.id, muted, deafened };
    const api = client.api as unknown as { patch(path: string, body: unknown): Promise<unknown> };
    void api.patch(`/channels/${channel.id}/voice_state`, { muted, deafened }).catch(() => {
      const still = this.#shown.channel === channel.id && this.#shown.muted === muted && this.#shown.deafened === deafened;
      if (still && attempt < 3) setTimeout(() => this.#reportState(attempt + 1), 1000);
    });
  }

  #applyVolume() {
    const room = this.#room;
    if (!room) return;
    for (const participant of room.remoteParticipants.values())
      for (const publication of participant.audioTrackPublications.values()) {
        const track = publication.track;
        if (track) this.#applyVolumeTo(track, participant.identity, publication.source);
      }
  }

  #applyVolumeTo(track: RemoteTrack, identity?: string, source?: string) {
    const s = callStore.get();
    const deafened = s.deafen || !s.canListen;
    const stream = source === "screen_share_audio";
    const volume =
      identity === undefined
        ? playbackVolume(this.#prefs.outputVolume, deafened)
        : personVolume({
            outputVolume: this.#prefs.outputVolume,
            person: stream ? s.volumes.streams[identity] : s.volumes.users[identity],
            muted: !stream && !!s.volumes.muted[identity],
            deafened,
          });
    try {
      (track as unknown as { setVolume?: (v: number) => void }).setVolume?.(volume);
    } catch {
      // a track that just ended
    }
  }

  /** Rebuild the tile list from the room (only when it really changed) */
  #rebuild() {
    const room = this.#room;
    if (!room) return;
    const tile = (p: Participant, local: boolean): Tile => {
      const cam = p.getTrackPublication("camera" as Track.Source);
      const screen = p.getTrackPublication("screen_share" as Track.Source);
      const mic = p.getTrackPublication("microphone" as Track.Source);
      return {
        id: p.identity,
        local,
        camera: !!cam?.track && !cam.isMuted,
        screen: !!screen?.track && !screen.isMuted,
        micMuted: !mic || mic.isMuted,
        weak: local ? undefined : qualityWarn(p.connectionQuality as ConnectionQualityName),
      };
    };
    const tiles = [tile(room.localParticipant, true), ...[...room.remoteParticipants.values()].map((p) => tile(p, false))];
    const current = callStore.get().tiles;
    const key = (list: Tile[]) => list.map((t) => `${t.id}:${+t.camera}${+t.screen}${+t.micMuted}${t.weak ?? ""}`);
    if (sameList(key(current), key(tiles))) return;
    patch({ tiles, camera: room.localParticipant.isCameraEnabled, screenshare: room.localParticipant.isScreenShareEnabled });
  }

  /** A control that failed during the call: its reason shows for a moment */
  #actionError(error: unknown) {
    const kind = voiceErrorKind(error);
    patch({ error: kind });
    setTimeout(() => {
      const s = callStore.get();
      if (s.status === "connected" && s.error === kind) patch({ error: undefined });
    }, NOTICE_MS);
  }

  #notice(notice: { kind: CallNotice; name?: string }) {
    clearTimeout(this.#noticeTimer);
    patch({ notice });
    this.#noticeTimer = setTimeout(() => patch({ notice: undefined }), NOTICE_MS);
  }

  /** Show a notice after the call ended (nobody answered) */
  endWithNotice(notice: { kind: CallNotice; name?: string }) {
    this.leave();
    this.#notice(notice);
  }

  /** A DM or group call nobody else is in yet rings the others */
  #ringOthers(room: Room, channel: Channel) {
    if (channel.type !== "DirectMessage" && channel.type !== "Group") return;
    const self = this.#client?.user?.id;
    const someoneThere = room.remoteParticipants.size > 0 || [...channel.voiceParticipants.keys()].some((id) => id !== self);
    if (someoneThere) return;
    try {
      startOutgoingRing(channel.id, [...channel.recipientIds].filter((id) => id !== self));
    } catch (error) {
      console.warn("[voice] could not start ringing", error);
    }
  }

  async #loadStage(channel: Channel) {
    const client = this.#client;
    if (!client) return;
    try {
      const state = await fetchStage(client, channel);
      if (this.#channel?.id === channel.id) this.setStage(state);
    } catch {
      // the stage panel shows the empty state
    }
  }

  async #loadSounds(channel: Channel) {
    const client = this.#client;
    const server = channel.server;
    if (!client || !server) return;
    try {
      const list = await fetchSoundboard(client, server);
      this.#sounds = new Map(list.sounds.map((s) => [s._id, s]));
    } catch {
      this.#sounds = new Map();
    }
  }

  #voiceEvent(event: { type: string } & Record<string, unknown>) {
    const channel = this.#channel;
    if (!channel) return;
    switch (event.type) {
      case "StageUpdate": {
        if (event.id !== channel.id) return;
        this.setStage(applyStageChange(callStore.get().stage ?? { speakers: [], hands: [] }, event.data as never));
        return;
      }
      case "SoundboardPlay": {
        if (event.channel_id !== channel.id) return;
        void this.#playHeard(String(event.sound_id));
        return;
      }
      case "SoundboardSoundCreate":
      case "SoundboardSoundUpdate": {
        if (event.server === channel.serverId) this.#sounds.set(String(event._id), { _id: String(event._id), volume: Number(event.volume ?? 100) });
        return;
      }
      case "SoundboardSoundDelete":
        this.#sounds.delete(String(event.id));
        return;
    }
  }

  /** A sound someone played in this call plays here (not while deafened) */
  async #playHeard(soundId: string) {
    const s = callStore.get();
    if (s.deafen || !s.canListen || this.#prefs.soundboardMuted) return;
    const media = this.#client?.configuration?.features?.autumn?.url;
    if (!media) return;
    if (!this.#sounds.has(soundId) && this.#channel) await this.#loadSounds(this.#channel);
    const sound = this.#sounds.get(soundId);
    if (!sound) return;
    try {
      const player = createAudioPlayer(soundUrl(media, soundId));
      player.volume = soundGain(sound.volume ?? 100, this.#prefs.soundboardVolume);
      const sub = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          sub.remove();
          player.remove();
        }
      });
      player.play();
    } catch (error) {
      console.warn("[voice] sound not played", error);
    }
  }
}

export const call = new CallController();

/** Whether a ring is going out for this call (the overlay plays the tone) */
export function outgoingFor(channelId: string | undefined) {
  const out = rings.get().outgoing;
  return out && out.channelId === channelId ? out : undefined;
}
