/**
 * The call controller against a fake LiveKit (no native code in Jest).
 */
import { EventEmitter } from "events";

const fakeRuntime: { current: unknown } = { current: null };

jest.mock("../native", () => ({
  voiceRuntime: () => fakeRuntime.current,
  hasNativeVoice: () => !!fakeRuntime.current,
}));
jest.mock("@/lib/secureStorage", () => ({
  secureStorage: {
    get: jest.fn(async () => JSON.stringify({ noiseSuppression: false, outputVolume: 0.5 })),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  },
}));
jest.mock("expo-audio", () => ({ createAudioPlayer: jest.fn(), requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })) }));
jest.mock("expo-image-picker", () => ({ requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })) }));
jest.mock("@zrzur/sdk/solid/voiceExtras", () => ({
  applyStageChange: (state: unknown) => state,
  fetchStage: jest.fn(async () => ({ speakers: [], hands: [] })),
  fetchSoundboard: jest.fn(async () => ({ sounds: [], limit: 0 })),
  playSound: jest.fn(async () => undefined),
}));

// eslint-disable-next-line import/first
import { call, callStore } from "../call";
// eslint-disable-next-line import/first
import { rings, resetRings } from "../ringing";

type Pub = { track?: { kind: string; setVolume?: jest.Mock }; isMuted: boolean };

class FakeParticipant {
  identity: string;
  sid = "PA_1";
  isCameraEnabled = false;
  isScreenShareEnabled = false;
  publications = new Map<string, Pub>();
  audioTrackPublications = new Map<string, Pub>();
  setMicrophoneEnabled = jest.fn(async (on: boolean) => {
    this.publications.set("microphone", { track: { kind: "audio" }, isMuted: !on });
  });
  setCameraEnabled = jest.fn(async (on: boolean) => {
    this.isCameraEnabled = on;
  });
  setScreenShareEnabled = jest.fn(async (on: boolean) => {
    this.isScreenShareEnabled = on;
  });
  constructor(identity: string) {
    this.identity = identity;
  }
  getTrackPublication(source: string) {
    return this.publications.get(source);
  }
}

class FakeRoom extends EventEmitter {
  static last: FakeRoom | undefined;
  state = "disconnected";
  localParticipant = new FakeParticipant("me");
  remoteParticipants = new Map<string, FakeParticipant>();
  options: unknown;
  constructor(options: unknown) {
    super();
    this.options = options;
    FakeRoom.last = this;
  }
  connect = jest.fn(async () => {
    this.state = "connected";
  });
  disconnect = jest.fn(async () => {
    this.state = "disconnected";
  });
}

const AudioSession = {
  configureAudio: jest.fn(async () => undefined),
  startAudioSession: jest.fn(async () => undefined),
  stopAudioSession: jest.fn(async () => undefined),
  getAudioOutputs: jest.fn(async () => ["speaker", "earpiece", "bluetooth"]),
  selectAudioOutput: jest.fn(async () => undefined),
  showAudioRoutePicker: jest.fn(async () => undefined),
};

const runtime = {
  lk: {
    Room: FakeRoom,
    RoomEvent: new Proxy({}, { get: (_, key) => String(key) }),
    DisconnectReason: { PARTICIPANT_REMOVED: 4, DUPLICATE_IDENTITY: 2 },
    VideoPresets: { h720: { resolution: {}, encoding: {} } },
    ScreenSharePresets: { h720fps15: { encoding: {} } },
    AudioPresets: { speech: {}, musicHighQuality: {} },
  },
  rn: { AudioSession, AndroidAudioTypePresets: { communication: {} } },
};

function fakeClient() {
  const emitter = new EventEmitter();
  const api = {
    post: jest.fn(async () => ({})),
    patch: jest.fn(async () => ({})),
    put: jest.fn(async () => ({})),
  };
  const client = {
    user: { id: "me" },
    api,
    limits: { video: true },
    configuration: { features: { livekit: { enabled: true, nodes: [{ name: "n1", public_url: "wss://voice.example" }] }, autumn: { url: "https://cdn.example" } } },
    serverMembers: { getByKey: () => undefined },
    channels: { get: () => undefined },
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return client;
}

function fakeChannel(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: "ch1",
    type,
    serverId: type === "VoiceChannel" ? "srv" : undefined,
    server: undefined,
    isStage: false,
    voiceParticipants: new Map<string, unknown>(),
    recipientIds: new Set(["me", "friend"]),
    havePermission: () => true,
    joinCall: jest.fn(async () => ({ url: "wss://voice.example", token: "tok" })),
    ...extra,
  };
}

describe("call controller", () => {
  let detach: () => void;
  let client: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeRuntime.current = runtime;
    client = fakeClient();
    detach = call.attach(client as never);
  });
  afterEach(() => {
    call.leave();
    detach();
    resetRings();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("says voice is unavailable without the native runtime", async () => {
    fakeRuntime.current = null;
    const fresh = new (Object.getPrototypeOf(call).constructor)();
    fresh.attach(client as never);
    await fresh.join(fakeChannel("VoiceChannel") as never);
    expect(callStore.get().error).toBe("unavailable");
    expect(callStore.get().status).toBe("idle");
  });

  it("joins with a token from join_call and the saved capture settings", async () => {
    const channel = fakeChannel("VoiceChannel");
    await call.join(channel as never);
    const room = FakeRoom.last!;
    expect(channel.joinCall).toHaveBeenCalledWith("n1");
    expect(room.connect).toHaveBeenCalledWith("wss://voice.example", "tok", { autoSubscribe: true });
    expect((room.options as { audioCaptureDefaults: unknown }).audioCaptureDefaults).toEqual({ noiseSuppression: false, echoCancellation: true, autoGainControl: true });
    expect(AudioSession.startAudioSession).toHaveBeenCalled();
    expect(callStore.get().status).toBe("connected");
    expect(callStore.get().channelId).toBe("ch1");
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, expect.anything());
    expect(callStore.get().tiles.map((t) => t.id)).toEqual(["me"]);
    // the mute state goes to the API for people outside the call
    expect(client.api.patch).toHaveBeenCalledWith("/channels/ch1/voice_state", { muted: false, deafened: false });
  });

  it("mutes, deafens and silences the voices", async () => {
    await call.join(fakeChannel("VoiceChannel") as never);
    const room = FakeRoom.last!;
    const remote = new FakeParticipant("friend");
    const voice = { track: { kind: "audio", setVolume: jest.fn() }, isMuted: false };
    remote.audioTrackPublications.set("a1", voice);
    room.remoteParticipants.set("friend", remote);

    await call.toggleMute();
    expect(callStore.get().micOn).toBe(false);
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, expect.anything());

    await call.toggleDeafen();
    expect(callStore.get().deafen).toBe(true);
    expect(voice.track.setVolume).toHaveBeenLastCalledWith(0);

    // unmuting while deafened undeafens too
    await call.toggleMute();
    expect(callStore.get().deafen).toBe(false);
    expect(callStore.get().micOn).toBe(true);
    expect(voice.track.setVolume).toHaveBeenLastCalledWith(0.5);
  });

  it("plays a person louder, quieter or not at all for me only", async () => {
    await call.join(fakeChannel("VoiceChannel") as never);
    const room = FakeRoom.last!;
    const remote = new FakeParticipant("friend");
    const voice = { track: { kind: "audio", setVolume: jest.fn() }, isMuted: false, source: "microphone" };
    remote.audioTrackPublications.set("a1", voice);
    room.remoteParticipants.set("friend", remote);

    // the saved output volume is 0.5: 0.5 × 2 = 1
    call.setPersonVolume("friend", 2);
    expect(voice.track.setVolume).toHaveBeenLastCalledWith(1);
    expect(callStore.get().volumes.users.friend).toBe(2);
    call.setPersonMuted("friend", true);
    expect(voice.track.setVolume).toHaveBeenLastCalledWith(0);
    call.setPersonMuted("friend", false);
    expect(voice.track.setVolume).toHaveBeenLastCalledWith(1);
    // kept for the next call
    call.leave();
    expect(callStore.get().volumes.users.friend).toBe(2);
  });

  it("remembers a mute chosen before joining", async () => {
    await call.toggleMute();
    expect(callStore.get().micOn).toBe(false);
    await call.join(fakeChannel("VoiceChannel") as never);
    expect(FakeRoom.last!.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, expect.anything());
    await call.toggleMute();
  });

  it("turns the camera on and off", async () => {
    await call.join(fakeChannel("VoiceChannel") as never);
    await call.toggleCamera();
    expect(callStore.get().camera).toBe(true);
    await call.toggleCamera();
    expect(callStore.get().camera).toBe(false);
  });

  it("lists outputs and selects one", async () => {
    await call.join(fakeChannel("VoiceChannel") as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(callStore.get().outputs).toContain("bluetooth");
    // Jest runs as iOS: the earpiece is iOS's "default" route
    await call.selectOutput("earpiece");
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith("default");
    expect(callStore.get().output).toBe("earpiece");
    await call.selectOutput("bluetooth");
    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
  });

  it("rings the other person in an empty DM call", async () => {
    await call.join(fakeChannel("DirectMessage") as never);
    expect(rings.get().outgoing?.ringing).toEqual(["friend"]);
    call.leave();
    expect(rings.get().outgoing).toBeUndefined();
  });

  it("asks a room maker for a room first", async () => {
    const made = fakeChannel("VoiceChannel", { id: "room2" });
    client.api.post.mockResolvedValueOnce({ _id: "room2" } as never);
    (client.channels as unknown as { getOrCreate: () => unknown }).getOrCreate = () => made;
    const opened = jest.fn();
    call.onRoomMade = opened;
    await call.join(fakeChannel("VoiceChannel") as never, { roomMaker: true });
    expect(client.api.post).toHaveBeenCalledWith("/channels/ch1/rooms");
    expect(opened).toHaveBeenCalledWith(made);
    expect(callStore.get().channelId).toBe("room2");
    call.onRoomMade = undefined;
  });

  it("goes back to the lobby with the reason when a join fails", async () => {
    const channel = fakeChannel("VoiceChannel", { joinCall: jest.fn(async () => Promise.reject({ type: "CannotJoinCall" })) });
    await call.join(channel as never);
    expect(callStore.get().status).toBe("idle");
    expect(callStore.get().error).toBe("full");
    expect(callStore.get().channelId).toBe("ch1");
  });

  it("leaves when removed by a moderator and resets the call", async () => {
    await call.join(fakeChannel("VoiceChannel") as never);
    FakeRoom.last!.emit("Disconnected", 4);
    expect(callStore.get().status).toBe("idle");
    expect(callStore.get().channelId).toBeUndefined();
  });

  it("follows a move to another channel", async () => {
    const target = fakeChannel("VoiceChannel", { id: "ch2" });
    (client.channels as unknown as { get: (id: string) => unknown }).get = (id: string) => (id === "ch2" ? target : undefined);
    await call.join(fakeChannel("VoiceChannel") as never);
    client.emit("userMoveVoiceChannel", { node: "n1", from: "ch1", to: "ch2", token: "t2" });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeRoom.last!.connect).toHaveBeenCalledWith("wss://voice.example", "t2", { autoSubscribe: true });
    expect(callStore.get().channelId).toBe("ch2");
  });
});
