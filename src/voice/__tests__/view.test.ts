jest.mock("../native", () => ({ voiceRuntime: () => null, hasNativeVoice: () => false }));
jest.mock("@/lib/secureStorage", () => ({ secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) } }));
jest.mock("expo-audio", () => ({ createAudioPlayer: jest.fn(), requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })) }));
jest.mock("expo-image-picker", () => ({ requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })) }));
jest.mock("@zrzur/sdk/solid/voiceExtras", () => ({ applyStageChange: (s: unknown) => s, fetchStage: jest.fn(), fetchSoundboard: jest.fn(), playSound: jest.fn() }));

/* eslint-disable import/first */
import { callStore, type CallSnapshot } from "../call";
import { askToCall, callAsk, callView, closeCallAsk, closeCallView, expandCallView, followCall, minimiseCallView, openCallView, setCallChat } from "../view";
import {
  ALONE_FACES,
  aloneFaces,
  CALL_PULL_DOWN,
  callPhase,
  callStart,
  ENDED_MS,
  endedOver,
  NO_VIEW,
  nextCallPull,
  phaseInCall,
  phaseIsLive,
  type PhaseInput,
  pillSnap,
  pillVisible,
  pullMinimises,
  pullOffset,
  screenVisible,
  viewOnCallChange,
  waitingFor,
} from "../viewLogic";
/* eslint-enable import/first */

const base: PhaseInput = { view: "dm", status: "idle", callChannel: undefined, error: undefined, available: true, ringing: false, others: false, ended: undefined };

describe("callPhase", () => {
  it("is idle without a screen", () => {
    expect(callPhase({ ...base, view: undefined, status: "connected", callChannel: "dm" })).toBe("idle");
  });

  it("rings while joining, the others' phones ring and nobody else is in", () => {
    expect(callPhase({ ...base, status: "connecting", callChannel: "dm", ringing: true })).toBe("ringing");
    expect(callPhase({ ...base, status: "connecting", callChannel: "dm", ringing: true, dm: true })).toBe("ringing");
    // connected while it still rings: you are in the call, alone
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", ringing: true })).toBe("alone");
    // someone answered: the call
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", ringing: true, others: true })).toBe("connected");
    // reconnecting is said as such even while ringing
    expect(callPhase({ ...base, status: "reconnecting", callChannel: "dm", ringing: true })).toBe("reconnecting");
  });

  it("is alone once connected in a DM or group call with nobody else", () => {
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", dm: true })).toBe("alone");
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", dm: true, ringing: true })).toBe("alone");
    // somebody joined: the call itself
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", dm: true, others: true })).toBe("connected");
    // still joining without a ring: connecting, not alone yet
    expect(callPhase({ ...base, status: "connecting", callChannel: "dm", dm: true })).toBe("connecting");
    // reconnecting and a lost call are said as such
    expect(callPhase({ ...base, status: "reconnecting", callChannel: "dm", dm: true })).toBe("reconnecting");
    expect(callPhase({ ...base, status: "disconnected", callChannel: "dm", dm: true })).toBe("disconnected");
    // a server room alone is just connected
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", dm: false })).toBe("connected");
    // how it ended wins
    expect(callPhase({ ...base, status: "connected", callChannel: "dm", dm: true, ended: "missed" })).toBe("ended");
  });

  it("alone counts as a live call with a running timer", () => {
    expect(phaseIsLive("alone")).toBe(true);
    expect(phaseInCall("alone")).toBe(true);
    expect(phaseInCall("connected")).toBe(true);
    for (const phase of ["ringing", "connecting", "reconnecting", "unavailable", "ended", "idle"] as const) expect(phaseInCall(phase)).toBe(false);
    expect(pillVisible({ phase: "alone", expanded: false, onCallPage: false })).toBe(true);
    expect(screenVisible({ phase: "alone", expanded: true, onCallPage: false })).toBe(true);
  });

  it("follows the call's status", () => {
    for (const status of ["connecting", "connected", "reconnecting", "disconnected"] as const) expect(callPhase({ ...base, status, callChannel: "dm" })).toBe(status);
  });

  it("a call in another channel does not count for this screen", () => {
    expect(callPhase({ ...base, status: "connected", callChannel: "other" })).toBe("ended");
  });

  it("keeps the full screen in a build without voice", () => {
    expect(callPhase({ ...base, available: false, error: "unavailable" })).toBe("unavailable");
    expect(callPhase({ ...base, available: false })).toBe("unavailable");
  });

  it("shows a failed join with its reason", () => {
    expect(callPhase({ ...base, error: "failed" })).toBe("failed");
  });

  it("shows how it ended before anything else", () => {
    expect(callPhase({ ...base, ended: "missed", status: "connected", callChannel: "dm" })).toBe("ended");
    expect(callPhase({ ...base, ended: "declined" })).toBe("ended");
  });
});

describe("pill and screen visibility", () => {
  it("shows the pill only while minimised during a call, away from the call's page", () => {
    expect(pillVisible({ phase: "connected", expanded: false, onCallPage: false })).toBe(true);
    expect(pillVisible({ phase: "ringing", expanded: false, onCallPage: false })).toBe(true);
    expect(pillVisible({ phase: "unavailable", expanded: false, onCallPage: false })).toBe(true);
    expect(pillVisible({ phase: "connected", expanded: true, onCallPage: false })).toBe(false);
    expect(pillVisible({ phase: "connected", expanded: false, onCallPage: true })).toBe(false);
  });

  it("hides the pill when the call is over or never started", () => {
    for (const phase of ["idle", "ended", "failed"] as const) expect(pillVisible({ phase, expanded: false, onCallPage: false })).toBe(false);
  });

  it("shows the full screen while expanded, including the ended state", () => {
    expect(screenVisible({ phase: "ended", expanded: true, onCallPage: false })).toBe(true);
    expect(screenVisible({ phase: "connected", expanded: false, onCallPage: false })).toBe(false);
    expect(screenVisible({ phase: "connected", expanded: true, onCallPage: true })).toBe(false);
    expect(screenVisible({ phase: "idle", expanded: true, onCallPage: false })).toBe(false);
  });
});

describe("viewOnCallChange", () => {
  const view = { channelId: "dm", expanded: true, chat: true };

  it("does nothing without a screen", () => {
    expect(viewOnCallChange(NO_VIEW, { status: "connected", channelId: "dm" }, { status: "idle" }, 5)).toBe(NO_VIEW);
  });

  it("says nobody answered, and closes the chat sheet", () => {
    const next = viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "idle", notice: { kind: "missed", name: "Sam" } }, 5);
    expect(next).toEqual({ channelId: "dm", expanded: true, chat: false, ended: { kind: "missed", name: "Sam", at: 5 } });
  });

  it("says declined", () => {
    expect(viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "idle", notice: { kind: "declined" } }, 5).ended?.kind).toBe("declined");
  });

  it("says the call ended otherwise", () => {
    expect(viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "idle" }, 5).ended).toEqual({ kind: "ended", name: undefined, at: 5 });
    // "reconnected" is not an end
    expect(viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "idle", notice: { kind: "reconnected" } }, 5).ended?.kind).toBe("ended");
  });

  it("takes the reason that comes just after the end", () => {
    const ended = viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "idle" }, 5);
    const notice = { kind: "declined" as const, name: "Sam" };
    const next = viewOnCallChange(ended, { status: "idle" }, { status: "idle", notice }, 6);
    expect(next.ended).toEqual({ kind: "declined", name: "Sam", at: 5 });
    // the same notice again changes nothing
    expect(viewOnCallChange(next, { status: "idle", notice }, { status: "idle", notice }, 7)).toBe(next);
  });

  it("a failed join that left first, then set its error, shows the error", () => {
    const ended = viewOnCallChange(view, { status: "connecting", channelId: "dm" }, { status: "idle" }, 5);
    expect(ended.ended?.kind).toBe("ended");
    const failed = viewOnCallChange(ended, { status: "idle" }, { status: "idle", channelId: "dm", error: "failed" }, 6);
    expect(failed.ended).toBeUndefined();
    expect(callPhase({ ...base, error: "failed", ended: failed.ended?.kind })).toBe("failed");
  });

  it("keeps the screen when joining failed, to show the reason", () => {
    expect(viewOnCallChange(view, { status: "connecting", channelId: "dm" }, { status: "idle", channelId: "dm", error: "failed" }, 5)).toBe(view);
  });

  it("ignores another call ending", () => {
    expect(viewOnCallChange(view, { status: "connected", channelId: "other" }, { status: "idle" }, 5)).toBe(view);
  });

  it("follows the call to the room it moved to", () => {
    expect(viewOnCallChange(view, { status: "connected", channelId: "dm" }, { status: "connecting", channelId: "room" }, 5).channelId).toBe("room");
  });

  it("a new call for the screen clears the ended state", () => {
    const ended = { ...view, ended: { kind: "missed" as const, at: 1 } };
    expect(viewOnCallChange(ended, { status: "idle" }, { status: "connecting", channelId: "dm" }, 5).ended).toBeUndefined();
  });

  it("knows when the ended state is over", () => {
    const ended = { ...view, ended: { kind: "ended" as const, at: 100 } };
    expect(endedOver(ended, 100 + ENDED_MS - 1)).toBe(false);
    expect(endedOver(ended, 100 + ENDED_MS)).toBe(true);
    expect(endedOver(view, 1e9)).toBe(false);
  });
});

describe("callStart", () => {
  const none = { channelId: "dm", callChannel: undefined, othersInCall: false, ringingMe: false };
  it("asks before a new call that rings the others", () => {
    expect(callStart(none)).toBe("ask");
    // being in another call does not skip the question
    expect(callStart({ ...none, callChannel: "other" })).toBe("ask");
  });
  it("joins at once when somebody is in it or it rings this account", () => {
    expect(callStart({ ...none, othersInCall: true })).toBe("join");
    expect(callStart({ ...none, ringingMe: true })).toBe("join");
    expect(callStart({ ...none, callChannel: "other", othersInCall: true })).toBe("join");
  });
  it("only opens the call this phone is in", () => {
    expect(callStart({ ...none, callChannel: "dm" })).toBe("open");
    expect(callStart({ ...none, callChannel: "dm", othersInCall: true, ringingMe: true })).toBe("open");
  });
});

describe("start question store", () => {
  it("opens for a channel with or without video and closes", () => {
    askToCall("dm", true);
    expect(callAsk.get()).toEqual({ channelId: "dm", video: true });
    askToCall("group", false);
    expect(callAsk.get()).toEqual({ channelId: "group", video: false });
    closeCallAsk();
    expect(callAsk.get()).toBeUndefined();
  });
});

describe("aloneFaces", () => {
  it("shows everyone up to the limit, then one less and +N", () => {
    expect(aloneFaces(0)).toEqual({ shown: 0, more: 0 });
    expect(aloneFaces(1)).toEqual({ shown: 1, more: 0 });
    expect(aloneFaces(ALONE_FACES)).toEqual({ shown: ALONE_FACES, more: 0 });
    expect(aloneFaces(ALONE_FACES + 1)).toEqual({ shown: ALONE_FACES - 1, more: 2 });
    expect(aloneFaces(40)).toEqual({ shown: ALONE_FACES - 1, more: 40 - (ALONE_FACES - 1) });
    expect(aloneFaces(-3)).toEqual({ shown: 0, more: 0 });
  });
});

describe("waitingFor", () => {
  it("lists the people being rung, never yourself or someone already in", () => {
    expect(waitingFor(["me", "a", "b", ""], ["a"], "me")).toEqual(["b"]);
    expect(waitingFor(["me", "a"], ["me", "a"], "me")).toEqual([]);
  });
});

describe("drag down to minimise", () => {
  it("starts on a downward drag only", () => {
    expect(nextCallPull("idle", 0, 5)).toBe("idle");
    expect(nextCallPull("idle", 2, 20)).toBe("pull");
    expect(nextCallPull("idle", 30, 10)).toBe("other");
    expect(nextCallPull("idle", 0, -20)).toBe("other");
    // decided once per touch
    expect(nextCallPull("other", 0, 200)).toBe("other");
    expect(nextCallPull("pull", 200, 0)).toBe("pull");
  });

  it("minimises far enough or on a flick", () => {
    expect(pullMinimises(CALL_PULL_DOWN, 0)).toBe(true);
    expect(pullMinimises(CALL_PULL_DOWN - 1, 0)).toBe(false);
    expect(pullMinimises(40, 1200)).toBe(true);
    expect(pullMinimises(10, 2000)).toBe(false);
  });

  it("follows the finger with resistance", () => {
    expect(pullOffset(-10)).toBe(0);
    expect(pullOffset(100)).toBe(60);
    expect(pullOffset(220)).toBe(97);
  });
});

describe("pillSnap", () => {
  const b = { width: 390, height: 844, pillWidth: 180, pillHeight: 52, top: 100, bottom: 700, edge: 12 };

  it("settles against the nearer side", () => {
    expect(pillSnap({ x: 20, y: 300, vx: 0, vy: 0 }, b)).toEqual({ x: 12, y: 300, side: "start" });
    expect(pillSnap({ x: 150, y: 300, vx: 0, vy: 0 }, b)).toEqual({ x: 198, y: 300, side: "end" });
  });

  it("goes where it was flicked", () => {
    expect(pillSnap({ x: 150, y: 300, vx: -1500, vy: 0 }, b).side).toBe("start");
  });

  it("stays between the header and the bottom bars", () => {
    expect(pillSnap({ x: 20, y: 0, vx: 0, vy: 0 }, b).y).toBe(100);
    expect(pillSnap({ x: 20, y: 900, vx: 0, vy: 0 }, b).y).toBe(700);
    expect(pillSnap({ x: 20, y: 650, vx: 0, vy: 1000 }, b).y).toBe(700);
  });
});

describe("callView store", () => {
  afterEach(() => {
    closeCallView();
    callStore.set((s) => ({ ...s, status: "idle", channelId: undefined, notice: undefined, error: undefined }));
  });

  it("opens, minimises to the pill, expands and closes", () => {
    openCallView("dm");
    expect(callView.get()).toEqual({ channelId: "dm", expanded: true, chat: false });
    setCallChat(true);
    expect(callView.get().chat).toBe(true);
    minimiseCallView();
    expect(callView.get()).toEqual({ channelId: "dm", expanded: false, chat: false });
    expandCallView();
    expect(callView.get().expanded).toBe(true);
    closeCallView();
    expect(callView.get()).toEqual(NO_VIEW);
  });

  it("shows how the call ended, then closes after ENDED_MS", () => {
    jest.useFakeTimers();
    const stop = followCall();
    try {
      openCallView("dm");
      callStore.set((s): CallSnapshot => ({ ...s, status: "connected", channelId: "dm" }));
      callStore.set((s): CallSnapshot => ({ ...s, status: "idle", channelId: undefined, notice: { kind: "missed", name: "Sam" } }));
      expect(callView.get().ended?.kind).toBe("missed");
      jest.advanceTimersByTime(ENDED_MS);
      expect(callView.get()).toEqual(NO_VIEW);
    } finally {
      stop();
      jest.useRealTimers();
    }
  });

  it("ringing -> nobody answered, as the call reports it (leave, then the notice)", () => {
    jest.useFakeTimers();
    const stop = followCall();
    try {
      openCallView("dm");
      callStore.set((s): CallSnapshot => ({ ...s, status: "connected", channelId: "dm" }));
      expect(callPhase({ ...base, status: "connected", callChannel: "dm", ringing: true, dm: true })).toBe("alone");
      callStore.set((s): CallSnapshot => ({ ...s, status: "idle", channelId: undefined, notice: undefined }));
      callStore.set((s): CallSnapshot => ({ ...s, notice: { kind: "missed", name: "Sam" } }));
      expect(callView.get().ended).toMatchObject({ kind: "missed", name: "Sam" });
      expect(callPhase({ ...base, ended: callView.get().ended?.kind })).toBe("ended");
      jest.advanceTimersByTime(ENDED_MS);
      expect(callView.get()).toEqual(NO_VIEW);
    } finally {
      stop();
      jest.useRealTimers();
    }
  });

  it("a new call started during the ended state keeps its screen", () => {
    jest.useFakeTimers();
    const stop = followCall();
    try {
      openCallView("dm");
      callStore.set((s): CallSnapshot => ({ ...s, status: "connected", channelId: "dm" }));
      callStore.set((s): CallSnapshot => ({ ...s, status: "idle", channelId: undefined }));
      expect(callView.get().ended?.kind).toBe("ended");
      openCallView("dm");
      jest.advanceTimersByTime(ENDED_MS);
      expect(callView.get()).toEqual({ channelId: "dm", expanded: true, chat: false });
    } finally {
      stop();
      jest.useRealTimers();
    }
  });
});
