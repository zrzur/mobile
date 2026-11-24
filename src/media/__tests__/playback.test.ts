import { call, callStore } from "@/voice/call";

import { audioModeFor, callActive, claimPlayback, createCoordinator, playback } from "../playback";
import { createVisibleRows } from "../visibleRows";

jest.mock("expo-audio", () => ({ setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock("@/voice/call", () => {
  let status = "idle";
  const listeners = new Set<() => void>();
  return {
    callStore: {
      get: () => ({ status }),
      set: (next: { status: string }) => {
        status = next.status;
        for (const listener of listeners) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    call: { restoreAudioSession: jest.fn(async () => undefined) },
  };
});

const setCall = (status: string) => (callStore as unknown as { set(v: { status: string }): void }).set({ status });

describe("one sound at a time", () => {
  it("starting a player pauses the one before", () => {
    const c = createCoordinator();
    const a = jest.fn();
    const b = jest.fn();
    c.claim(a);
    c.claim(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    c.pauseCurrent();
    expect(b).toHaveBeenCalledTimes(1);
    expect(c.busy()).toBe(false);
  });

  it("a released player is no longer paused by the next one", () => {
    const c = createCoordinator();
    const a = jest.fn();
    const release = c.claim(a);
    release();
    c.claim(jest.fn());
    expect(a).not.toHaveBeenCalled();
  });

  it("a call starting pauses what plays; releasing during a call restores the call's audio", () => {
    const pause = jest.fn();
    const release = claimPlayback(pause);
    setCall("connecting");
    expect(pause).toHaveBeenCalledTimes(1);
    release();
    expect(call.restoreAudioSession).toHaveBeenCalledTimes(1);
    setCall("idle");
    expect(playback.busy()).toBe(false);
  });
});

describe("audio mode", () => {
  it("never changes the session during a call", () => {
    expect(audioModeFor("play", true)).toBeNull();
    expect(audioModeFor("record", true)).toBeNull();
    expect(audioModeFor("record-end", true)).toBeNull();
  });

  it("pauses other apps' audio for notes and recordings", () => {
    expect(audioModeFor("play", false)).toMatchObject({ interruptionMode: "doNotMix", allowsRecording: false, playsInSilentMode: true });
    expect(audioModeFor("record", false)).toMatchObject({ interruptionMode: "doNotMix", allowsRecording: true });
    expect(audioModeFor("record-end", false)).toEqual({ allowsRecording: false });
  });

  it("counts connecting, connected and reconnecting as in a call", () => {
    expect(callActive("idle")).toBe(false);
    expect(callActive("disconnected")).toBe(false);
    expect(callActive("connecting")).toBe(true);
    expect(callActive("connected")).toBe(true);
    expect(callActive("reconnecting")).toBe(true);
  });
});

describe("visible rows", () => {
  it("counts every row visible until the list reports, then only the reported ones", () => {
    const rows = createVisibleRows();
    expect(rows.has("A")).toBe(true);
    const listener = jest.fn();
    rows.subscribe(listener);
    rows.set(["B", "C"]);
    expect(rows.has("A")).toBe(false);
    expect(rows.has("B")).toBe(true);
    rows.set(["C", "B"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
