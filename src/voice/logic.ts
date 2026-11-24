/**
 * Pure voice logic, ported from the web app (packages/client/components/rtc
 * and features/voice on beta). No React, no native modules: every rule here
 * is covered by src/voice/__tests__/logic.test.ts.
 */

// --- errors -----------------------------------------------------------------

/**
 * The error type of a failed voice action (web: rtc/moderation.ts
 * voiceErrorType). The screens turn it into words with `voiceErrorKind`.
 */
export function voiceErrorType(error: unknown): string {
  if (typeof error === "string") {
    try {
      return voiceErrorType(JSON.parse(error));
    } catch {
      return /429|Too Many Requests/.test(error) ? "RateLimited" : "NetworkError";
    }
  }
  if (typeof error !== "object" || error === null) return "NetworkError";
  const data = error as {
    code?: number;
    retry_after?: number;
    type?: string;
    response?: { data?: { type?: string } };
    name?: string;
  };
  if (data.code === 429 || (data.retry_after !== undefined && !data.type)) return "RateLimited";
  return data.type ?? data.response?.data?.type ?? data.name ?? "NetworkError";
}

/** The message a voice error shows (web: rtc/messages.ts useVoiceError) */
export type VoiceErrorKind =
  | "unavailable"
  | "rateLimited"
  | "internal"
  | "full"
  | "permission"
  | "notElevated"
  | "owner"
  | "notConnected"
  | "gone"
  | "elsewhere"
  | "refused"
  | "deviceAccess"
  | "noDevice"
  | "failed";

export function voiceErrorKind(error: unknown): VoiceErrorKind {
  switch (voiceErrorType(error)) {
    case "VoiceUnavailable":
      return "unavailable";
    case "RateLimited":
      return "rateLimited";
    case "InternalError":
      return "internal";
    case "CannotJoinCall":
      return "full";
    case "MissingPermission":
      return "permission";
    case "NotElevated":
      return "notElevated";
    case "InvalidOperation":
      return "owner";
    case "NotConnected":
      return "notConnected";
    case "NotAVoiceChannel":
    case "UnknownChannel":
      return "gone";
    case "AlreadyConnected":
      return "elsewhere";
    case "VoiceRejoinRefused":
      return "refused";
    case "NotAllowedError":
      return "deviceAccess";
    case "NotFoundError":
      return "noDevice";
    default:
      return "failed";
  }
}

/** Whether a failed rejoin may be tried again (a server refusal is final) */
export function canRetryRejoin(error: unknown): boolean {
  const type = voiceErrorType(error);
  return type !== "AlreadyConnected" && type !== "VoiceRejoinRefused";
}

/** Waits between rejoin attempts after a network drop (about a minute in total) */
export const REJOIN_DELAYS = [1000, 2000, 4000, 8000, 15000, 15000, 15000];

/** How long a short notice next to the call status stays */
export const NOTICE_MS = 6000;

// --- nodes ------------------------------------------------------------------

/** LiveKit advertises ws/wss; the health probe needs http/https */
export function livekitHealthUrl(publicUrl: string): string {
  if (publicUrl.startsWith("wss://")) return `https://${publicUrl.slice("wss://".length)}`;
  if (publicUrl.startsWith("ws://")) return `http://${publicUrl.slice("ws://".length)}`;
  return publicUrl;
}

/** Only encrypted voice servers (plain ws only for a local development server) */
export function allowedVoiceUrl(url: string, dev = false): boolean {
  if (url.startsWith("wss://") || url.startsWith("https://")) return true;
  return dev && /^(ws|http):\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?(\/|$)/.test(url);
}

// --- rooms ------------------------------------------------------------------

/** How full a voice channel is (web: voiceOccupancy) */
export function occupancy(count: number, maximum: number | undefined) {
  return { count, maximum, full: maximum !== undefined && maximum > 0 && count >= maximum };
}

/** The extra room fields the SDK on the phone does not hydrate yet */
export type RoomInfo = {
  /** Room maker: joining hands the member a room of their own */
  maker: boolean;
  /** The member a temporary room was made for */
  temporaryFor?: string;
  locked: boolean;
  hidden: boolean;
};

/** Read the room fields from a raw channel object (GET /channels/:id) */
export function roomInfoOf(raw: unknown): RoomInfo {
  const voice = (raw as { voice?: Record<string, unknown> } | null)?.voice ?? {};
  return {
    maker: voice.maker === true,
    temporaryFor: typeof voice.temporary_for === "string" ? voice.temporary_for : undefined,
    locked: voice.locked === true,
    hidden: voice.hidden === true,
  };
}

/**
 * Whether this user controls a temporary room: the member it was made for,
 * or someone who manages permissions in it (web: controlsRoom)
 */
export function controlsRoom(info: RoomInfo | undefined, userId: string | undefined, managesPermissions: boolean): boolean {
  return !!info?.temporaryFor && (info.temporaryFor === userId || managesPermissions);
}

/**
 * The room size stepper (web: RoomControlsPanel): Fewer goes down to 0 (no
 * limit), More starts at 2 and stops at 99; the server caps the rest
 */
export const ROOM_LIMIT_MAX = 99;
export function stepLimit(limit: number, by: 1 | -1): number {
  if (by > 0) return Math.min(ROOM_LIMIT_MAX, limit === 0 ? 2 : limit + 1);
  return Math.max(0, limit - 1);
}

/** The voice change that sets a room size; 0 takes the limit away */
export function userLimitChange(limit: number | null | undefined) {
  return { max_users: limit && limit > 0 ? limit : 0 };
}

// --- moderation -------------------------------------------------------------

/**
 * What a member may do to another in a call (web: voiceModeration). The
 * caller passes plain facts so this stays pure.
 */
export function moderationRights(facts: {
  actorId: string;
  targetId: string;
  ownerId: string;
  actorRank: number;
  targetRank: number;
  targetPresent: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  moveMembers: boolean;
}) {
  const elevated =
    facts.actorId !== facts.targetId &&
    (facts.actorId === facts.ownerId || (facts.targetId !== facts.ownerId && facts.actorRank < facts.targetRank));
  const ok = elevated && facts.targetPresent;
  return {
    mute: ok && facts.muteMembers,
    deafen: ok && facts.deafenMembers,
    move: ok && facts.moveMembers,
    any: ok && (facts.muteMembers || facts.deafenMembers || facts.moveMembers),
  };
}

// --- stage ------------------------------------------------------------------

export type StageState = { topic?: string; speakers: string[]; hands: string[] };
export type StageRole = "speaker" | "hand" | "audience";

/**
 * Split the people in a stage call into speakers, raised hands and the rest
 * (web: stageRoles)
 */
export function stageRoles(state: StageState, inCall: string[], me: string) {
  const present = new Set(inCall);
  if (me) present.add(me);
  const speakers = state.speakers.filter((id) => present.has(id));
  const hands = state.hands.filter((id) => present.has(id) && !speakers.includes(id));
  const taken = new Set([...speakers, ...hands]);
  const audience = [...present].filter((id) => !taken.has(id));
  const mine: StageRole = speakers.includes(me) ? "speaker" : hands.includes(me) ? "hand" : "audience";
  return { speakers, hands, audience, mine };
}

// --- controls ---------------------------------------------------------------

/** The microphone button's words (web: VoiceCallCardActions) */
export function micLabel(s: { serverMuted: boolean; canSpeak: boolean; unmuted: boolean }): "serverMuted" | "mute" | "unmute" | "missing" {
  if (s.serverMuted) return "serverMuted";
  if (!s.canSpeak) return "missing";
  return s.unmuted ? "mute" : "unmute";
}

/** The deafen button's words */
export function deafenLabel(s: { serverDeafened: boolean; canListen: boolean; deafened: boolean }): "serverDeafened" | "deafen" | "undeafen" | "missing" {
  if (s.serverDeafened) return "serverDeafened";
  if (!s.canListen) return "missing";
  return s.deafened ? "undeafen" : "deafen";
}

/**
 * Whether the microphone is open: the saved choice, minus deafen, minus
 * moderation and a stage seat (web: Voice.microphone)
 */
export function microphoneOpen(s: { micOn: boolean; deafen: boolean; canSpeak: boolean }): boolean {
  return s.micOn && !s.deafen && s.canSpeak;
}

/**
 * Whether this person may speak in the call (web: speakingPermission): the
 * Speak permission, no server mute, and on a stage a speaker's seat
 */
export function canSpeak(s: { speakPermission: boolean; serverMuted: boolean; stage: boolean; stageSpeaker: boolean }): boolean {
  return s.speakPermission && !s.serverMuted && (!s.stage || s.stageSpeaker);
}

// --- audio ------------------------------------------------------------------

/** The capture constraints the voice settings ask for */
export function captureOptions(prefs: { noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean }) {
  return {
    noiseSuppression: prefs.noiseSuppression,
    echoCancellation: prefs.echoCancellation,
    autoGainControl: prefs.autoGain,
  };
}

/** The playback volume of the call's voices: 0 when deafened */
export function playbackVolume(outputVolume: number, deafened: boolean): number {
  if (deafened) return 0;
  return Math.min(1, Math.max(0, Number.isFinite(outputVolume) ? outputVolume : 1));
}

/** A soundboard sound's file (web: soundUrl) */
export function soundUrl(mediaUrl: string, soundId: string): string {
  return `${mediaUrl.replace(/\/$/, "")}/sounds/${soundId}/original`;
}

/** The gain a sound plays at: its own volume (0-100) times the listener's (0-1) */
export function soundGain(soundVolume: number, listenerVolume: number): number {
  const own = Math.min(100, Math.max(0, soundVolume)) / 100;
  return own * Math.min(1, Math.max(0, listenerVolume));
}

/** Where the call's sound goes */
export type OutputRoute = "speaker" | "earpiece" | "headset" | "bluetooth";

/**
 * The routes to offer from what the platform reports. Android lists real
 * routes; iOS only knows "default" (earpiece or the connected headset) and
 * "force_speaker", and shows its own picker for Bluetooth and AirPlay.
 */
export function outputRoutes(platform: string, reported: string[]): OutputRoute[] {
  if (platform === "ios") return ["speaker", "earpiece", "bluetooth"];
  const order: OutputRoute[] = ["speaker", "earpiece", "headset", "bluetooth"];
  const known = new Set(reported);
  const list = order.filter((route) => known.has(route));
  return list.length ? list : ["speaker"];
}

/** The device id to select for a route, or "picker" for the iOS route picker */
export function routeDevice(platform: string, route: OutputRoute): string {
  if (platform !== "ios") return route;
  if (route === "speaker") return "force_speaker";
  if (route === "bluetooth") return "picker";
  return "default";
}

/** Voice channels start on the loudspeaker; DM calls at the ear, like a phone call */
export function defaultRoute(dm: boolean): OutputRoute {
  return dm ? "earpiece" : "speaker";
}

// --- speaking ---------------------------------------------------------------

/**
 * Collects the active speakers LiveKit reports (several times a second) and
 * tells the screen at most once per `interval`, and only when the set really
 * changed. Keeps the tiles from re-rendering on every audio level.
 */
export class SpeakingThrottle {
  #last: string[] = [];
  #pending: string[] | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #lastEmit = -Infinity;

  constructor(
    private readonly emit: (ids: string[]) => void,
    private readonly interval = 250,
    private readonly now: () => number = Date.now,
  ) {}

  /** The newest list of speaking participants */
  push(ids: string[]) {
    const next = [...new Set(ids)].sort();
    if (!this.#timer && sameList(next, this.#last)) {
      this.#pending = undefined;
      return;
    }
    this.#pending = next;
    if (this.#timer) return;
    const wait = Math.max(0, this.#lastEmit + this.interval - this.now());
    if (wait === 0) this.#flush();
    else this.#timer = setTimeout(() => this.#flush(), wait);
  }

  #flush() {
    this.#timer = undefined;
    const next = this.#pending;
    this.#pending = undefined;
    if (!next || sameList(next, this.#last)) return;
    this.#last = next;
    this.#lastEmit = this.now();
    this.emit(next);
  }

  /** Stop (the call ended) */
  clear() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending = undefined;
    this.#last = [];
  }
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- layout -----------------------------------------------------------------

/** Tile columns for a grid of `count` people on a screen `width` wide */
export function gridColumns(count: number, width: number): number {
  if (count <= 1) return 1;
  if (width >= 700) return count <= 4 ? 2 : count <= 9 ? 3 : 4;
  if (count <= 4) return 2;
  return width >= 420 ? 3 : 2;
}

/** Participants in tile order: you first, then everyone else in join order */
export function tileOrder(ids: string[], self: string | undefined): string[] {
  const rest = ids.filter((id) => id !== self);
  return self && ids.includes(self) ? [self, ...rest] : rest;
}

/** "mm:ss" or "h:mm:ss" since a call started */
export function callDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
