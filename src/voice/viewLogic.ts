/**
 * The call screen's state rules, kept pure so they are unit tested: which
 * phase the screen shows, when the floating pill shows, how the screen
 * follows the call when it ends, the drag-down to minimise, and where the
 * dragged pill settles.
 */
import type { CallNotice, CallStatus } from "./call";
import type { VoiceErrorKind } from "./logic";

/** How long the "Nobody answered" / "Call ended" state stays before the screen closes (ms) */
export const ENDED_MS = 2200;

export type EndKind = "missed" | "declined" | "ended";

/** The call screen (the overlay over the app): which call it shows and how */
export type CallView = {
  /** The DM, group or voice channel the screen is for (set while the screen or its pill exists) */
  channelId?: string;
  /** Full screen; false = minimised to the pill */
  expanded: boolean;
  /** The conversation sheet over the call */
  chat: boolean;
  /** The call ended while the screen was open: what to say before it closes */
  ended?: { kind: EndKind; name?: string; at: number };
};

export const NO_VIEW: CallView = { expanded: false, chat: false };

/**
 * What the call screen shows:
 * - `unavailable`: this build has no voice (Expo Go); the full screen stays, with the note;
 * - `ringing`: you started the call, it is still joining and the others'
 *   phones ring;
 * - `alone`: a DM or group call you are in with nobody else (yet, or any
 *   more): your own tile large, the others below until they join; the ring
 *   and its "Nobody answered" go on as before;
 * - `connecting` / `connected` / `reconnecting` / `disconnected`: the call itself;
 * - `failed`: joining failed (the reason and Try again);
 * - `ended`: missed, declined or ended, shown a moment before the screen closes;
 * - `idle`: nothing to show.
 */
export type CallPhase = "idle" | "unavailable" | "ringing" | "alone" | "connecting" | "connected" | "reconnecting" | "disconnected" | "failed" | "ended";

export type PhaseInput = {
  /** The channel the screen is for */
  view: string | undefined;
  status: CallStatus;
  /** The channel the call is in */
  callChannel: string | undefined;
  error: VoiceErrorKind | undefined;
  /** This build can make calls */
  available: boolean;
  /** An outgoing ring for the view's channel is still open (somebody's phone rings) */
  ringing: boolean;
  /** Someone else is in the call already */
  others: boolean;
  /** The call is a DM or group call (a server room never shows "alone") */
  dm?: boolean;
  ended: EndKind | undefined;
};

export function callPhase(input: PhaseInput): CallPhase {
  if (!input.view) return "idle";
  if (input.ended) return "ended";
  if (input.status !== "idle" && input.callChannel === input.view) {
    // ringing only happens in a DM or group call
    const alone = !input.others && (!!input.dm || input.ringing);
    if (alone && input.status === "connected") return "alone";
    if (alone && input.ringing && input.status === "connecting") return "ringing";
    return input.status as Exclude<CallStatus, "idle">;
  }
  if (!input.available) return "unavailable";
  if (input.error) return "failed";
  return "ended";
}

/** Phases in which a call (or the call screen of a build without voice) is going on */
export function phaseIsLive(phase: CallPhase): boolean {
  return phase === "ringing" || phase === "alone" || phase === "connecting" || phase === "connected" || phase === "reconnecting" || phase === "disconnected" || phase === "unavailable";
}

/**
 * The floating pill: while a call goes on and its screen is minimised, on
 * every page except that call's own page (which shows the call itself).
 */
export function pillVisible(input: { phase: CallPhase; expanded: boolean; onCallPage: boolean }): boolean {
  return phaseIsLive(input.phase) && !input.expanded && !input.onCallPage;
}

/** The full screen over the app: open, and not on the call's own page */
export function screenVisible(input: { phase: CallPhase; expanded: boolean; onCallPage: boolean }): boolean {
  return input.phase !== "idle" && input.expanded && !input.onCallPage;
}

type CallFacts = { status: CallStatus; channelId?: string; error?: VoiceErrorKind; notice?: { kind: CallNotice; name?: string } };

/**
 * The call changed: follow it.
 * - The call moved to another room (a room maker, being moved): the screen follows.
 * - The call the screen is for ended without an error: missed, declined or
 *   ended is shown (the screen closes after ENDED_MS). With an error the
 *   screen stays and shows it.
 */
export function viewOnCallChange(view: CallView, prev: CallFacts, next: CallFacts, now: number): CallView {
  if (!view.channelId) return view;
  if (next.status !== "idle" && next.channelId && prev.status !== "idle" && prev.channelId === view.channelId && next.channelId !== view.channelId)
    return { ...view, channelId: next.channelId };
  if (prev.status !== "idle" && next.status === "idle" && prev.channelId === view.channelId) {
    if (next.error) return view;
    const notice = next.notice && next.notice.kind !== "reconnected" ? next.notice : undefined;
    return { ...view, chat: false, ended: { kind: notice ? (notice.kind as EndKind) : "ended", name: notice?.name, at: now } };
  }
  // joining failed (the call leaves, then sets the error): show the reason, not "ended"
  if (view.ended && next.status === "idle" && next.error && !prev.error) return { ...view, ended: undefined };
  // the reason comes just after the end (the call leaves, then says why)
  if (view.ended && next.status === "idle" && next.notice && next.notice !== prev.notice && next.notice.kind !== "reconnected")
    return { ...view, ended: { ...view.ended, kind: next.notice.kind as EndKind, name: next.notice.name } };
  // a new call started for this screen: whatever ended before is over
  if (next.status !== "idle" && next.channelId === view.channelId && view.ended) return { ...view, ended: undefined };
  return view;
}

/** The ended state has been shown long enough */
export function endedOver(view: CallView, now: number): boolean {
  return !!view.ended && now - view.ended.at >= ENDED_MS;
}

/**
 * The people a call shows before they are in it: in a DM or group you
 * started, everyone else (their phones ring); never yourself or someone
 * already in.
 */
export function waitingFor(members: readonly string[], inCall: readonly string[], selfId: string | undefined): string[] {
  const present = new Set(inCall);
  return members.filter((id) => !!id && id !== selfId && !present.has(id));
}

/** The call is in, with a running timer: connected, alone or not */
export function phaseInCall(phase: CallPhase): boolean {
  return phase === "connected" || phase === "alone";
}

/** At most this many pictures under your tile when alone; more become "+N" */
export const ALONE_FACES = 5;

/**
 * How the waiting people show while you are alone: all of them up to
 * ALONE_FACES; past that, one place less and a "+N" for the rest.
 */
export function aloneFaces(waiting: number): { shown: number; more: number } {
  const count = Math.max(0, Math.floor(waiting));
  if (count <= ALONE_FACES) return { shown: count, more: 0 };
  return { shown: ALONE_FACES - 1, more: count - (ALONE_FACES - 1) };
}

// --- before a call starts ---------------------------------------------------------

/**
 * What the call button of a DM or group does:
 * - `open`: this phone is in that call already: the call screen opens;
 * - `join`: somebody is in it, or it is ringing this account: join at once
 *   (nobody is woken up by it);
 * - `ask`: a new call that rings the others: confirm first.
 */
export type CallStart = "open" | "join" | "ask";

export function callStart(input: {
  channelId: string;
  /** The call this phone is in (status not idle) */
  callChannel: string | undefined;
  /** Someone other than you is in the channel's call */
  othersInCall: boolean;
  /** The channel is ringing this account now */
  ringingMe: boolean;
}): CallStart {
  if (input.callChannel === input.channelId) return "open";
  if (input.othersInCall || input.ringingMe) return "join";
  return "ask";
}

/** The start question that is open: for which channel, and with video */
export type CallAsk = { channelId: string; video: boolean };

// --- drag down to minimise (web: callPull.ts) -----------------------------------

/** Drag the call down this far (px) and it is put aside */
export const CALL_PULL_DOWN = 90;
/** The drag starts after this much downward movement (px) */
export const CALL_PULL_START = 14;

export type CallPull = "idle" | "pull" | "other";

/**
 * A finger going down, more down than sideways, starts the pull; sideways
 * or upwards first belongs to something else for that touch.
 */
export function nextCallPull(phase: CallPull, dx: number, dy: number): CallPull {
  if (phase !== "idle") return phase;
  if (Math.abs(dx) > 12 && Math.abs(dx) > dy) return "other";
  if (dy < -CALL_PULL_START) return "other";
  if (dy > CALL_PULL_START && dy > Math.abs(dx) * 1.5) return "pull";
  return "idle";
}

/** Let go: far enough, or a quick flick down, minimises */
export function pullMinimises(dy: number, velocityY: number): boolean {
  return dy >= CALL_PULL_DOWN || (dy > CALL_PULL_START * 2 && velocityY > 800);
}

/** How far the screen follows the finger (it resists, as a sheet does) */
export function pullOffset(dy: number): number {
  if (dy <= 0) return 0;
  return Math.round(dy < 120 ? dy * 0.6 : 72 + (dy - 120) * 0.25);
}

// --- the floating pill -----------------------------------------------------------

export type PillBounds = {
  width: number;
  height: number;
  pillWidth: number;
  pillHeight: number;
  /** Highest the pill may sit (below the header) */
  top: number;
  /** Lowest the pill's top may sit (above the composer or tab bar) */
  bottom: number;
  /** Space to the side edges */
  edge: number;
};

/**
 * Where a let-go pill settles: against the nearer side edge (a flick picks
 * the side it was thrown to), its height kept inside the allowed band.
 * `x` is the distance from the layout's start edge (RTL-safe).
 */
export function pillSnap(pos: { x: number; y: number; vx: number; vy: number }, b: PillBounds): { x: number; y: number; side: "start" | "end" } {
  const projectedX = pos.x + pos.vx * 0.15;
  const middle = (b.width - b.pillWidth) / 2;
  const side: "start" | "end" = projectedX < middle ? "start" : "end";
  const x = side === "start" ? b.edge : Math.max(b.edge, b.width - b.pillWidth - b.edge);
  const projectedY = pos.y + pos.vy * 0.1;
  const y = Math.round(Math.min(Math.max(b.top, b.bottom), Math.max(b.top, projectedY)));
  return { x, y, side };
}
