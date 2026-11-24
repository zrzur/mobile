import {
  applyRingEvent,
  clearOutgoingRing,
  dismissIncomingRing,
  expireRings,
  isRingEvent,
  NO_RINGS,
  outgoingOutcome,
  receiveRingEvent,
  resetRings,
  RING_TIMEOUT_MS,
  rings,
  startOutgoingRing,
} from "../ringing";
import { createStore, fieldsReader, pickFields } from "../store";

describe("applyRingEvent", () => {
  it("rings others, never yourself", () => {
    const ringing = applyRingEvent(NO_RINGS, { type: "VoiceCallUpdate", initiator_id: "caller", channel_id: "dm", ended: false }, "me", 10);
    expect(ringing.incoming).toEqual([{ channelId: "dm", initiatorId: "caller", at: 10 }]);
    expect(applyRingEvent(NO_RINGS, { type: "VoiceCallUpdate", initiator_id: "me", channel_id: "dm", ended: false }, "me", 10)).toBe(NO_RINGS);
    // the same call again replaces, never doubles
    const again = applyRingEvent(ringing, { type: "VoiceCallUpdate", initiator_id: "caller", channel_id: "dm", ended: false }, "me", 20);
    expect(again.incoming).toHaveLength(1);
  });

  it("ends with the call", () => {
    const state = { incoming: [{ channelId: "dm", initiatorId: "c", at: 1 }], outgoing: { channelId: "dm", ringing: ["x"], declined: [], missed: [], at: 1 } };
    const ended = applyRingEvent(state, { type: "VoiceCallUpdate", initiator_id: "c", channel_id: "dm", ended: true }, "me", 2);
    expect(ended).toEqual({ incoming: [], outgoing: undefined });
  });

  it("tracks who declined and who missed", () => {
    let state = { incoming: [], outgoing: { channelId: "g", ringing: ["a", "b"], declined: [] as string[], missed: [] as string[], at: 0 } };
    state = applyRingEvent(state, { type: "VoiceRingEnd", channel_id: "g", user: "a", reason: "Declined" }, "me", 1) as typeof state;
    expect(outgoingOutcome(state.outgoing)).toBeUndefined();
    state = applyRingEvent(state, { type: "VoiceRingEnd", channel_id: "g", user: "b", reason: "Missed" }, "me", 2) as typeof state;
    expect(state.outgoing.declined).toEqual(["a"]);
    expect(state.outgoing.missed).toEqual(["b"]);
    expect(outgoingOutcome(state.outgoing)).toBe("missed");
  });

  it("stops ringing here when this account answered elsewhere", () => {
    const state = { incoming: [{ channelId: "dm", initiatorId: "c", at: 1 }] };
    expect(applyRingEvent(state, { type: "VoiceRingEnd", channel_id: "dm", user: "me", reason: "Answered" }, "me", 2).incoming).toEqual([]);
  });
});

describe("outcomes and expiry", () => {
  it("is declined only when everyone declined", () => {
    expect(outgoingOutcome({ channelId: "d", ringing: [], declined: ["a"], missed: [], at: 0 })).toBe("declined");
    expect(outgoingOutcome({ channelId: "d", ringing: [], declined: [], missed: [], at: 0 })).toBeUndefined();
    expect(outgoingOutcome(undefined)).toBeUndefined();
  });

  it("expires old rings and marks the rest missed", () => {
    const state = {
      incoming: [
        { channelId: "old", initiatorId: "c", at: 0 },
        { channelId: "new", initiatorId: "c", at: RING_TIMEOUT_MS },
      ],
      outgoing: { channelId: "g", ringing: ["a"], declined: [], missed: [], at: 0 },
    };
    const next = expireRings(state, RING_TIMEOUT_MS + 1);
    expect(next.incoming.map((r) => r.channelId)).toEqual(["new"]);
    expect(next.outgoing).toEqual({ channelId: "g", ringing: [], declined: [], missed: ["a"], at: 0 });
    // nothing to change keeps the same object
    expect(expireRings(next, RING_TIMEOUT_MS + 2)).toBe(next);
  });

  it("knows the ringing events", () => {
    expect(isRingEvent({ type: "VoiceCallUpdate" })).toBe(true);
    expect(isRingEvent({ type: "VoiceRingEnd" })).toBe(true);
    expect(isRingEvent({ type: "Message" })).toBe(false);
    expect(isRingEvent(null)).toBe(false);
  });
});

describe("live ring state", () => {
  afterEach(() => resetRings());

  it("starts, clears and dismisses", () => {
    startOutgoingRing("dm", ["friend"]);
    expect(rings.get().outgoing?.ringing).toEqual(["friend"]);
    clearOutgoingRing("other");
    expect(rings.get().outgoing).toBeDefined();
    clearOutgoingRing("dm");
    expect(rings.get().outgoing).toBeUndefined();

    receiveRingEvent({ type: "VoiceCallUpdate", initiator_id: "c", channel_id: "dm2", ended: false }, "me");
    expect(rings.get().incoming).toHaveLength(1);
    dismissIncomingRing("dm2");
    expect(rings.get().incoming).toHaveLength(0);
  });

  it("starts no outgoing ring with nobody to ring", () => {
    startOutgoingRing("dm", []);
    expect(rings.get().outgoing).toBeUndefined();
  });
});

describe("store", () => {
  it("notifies on change only", () => {
    const store = createStore({ a: 1, b: 2 });
    const seen = jest.fn();
    const stop = store.subscribe(seen);
    const same = store.get();
    store.set(same);
    expect(seen).not.toHaveBeenCalled();
    store.set((s) => ({ ...s, a: 2 }));
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    store.set((s) => ({ ...s, a: 3 }));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("hands out the same fields object until a picked field changes", () => {
    const store = createStore({ a: 1, b: 2, speaking: [] as string[] });
    const read = fieldsReader(store, ["a", "b"] as const);
    const first = read();
    store.set((s) => ({ ...s, speaking: ["x"] }));
    expect(read()).toBe(first);
    store.set((s) => ({ ...s, a: 5 }));
    expect(read()).toEqual({ a: 5, b: 2 });
    expect(pickFields({ a: 1, b: 2 }, ["b"] as const)).toEqual({ b: 2 });
  });
});
