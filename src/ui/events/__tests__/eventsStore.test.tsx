import { act, renderHook } from "@testing-library/react-native";

import { fetchServerEvents, resetEventsStore, useDraftIds, useEventsLoaded } from "../eventsStore";

jest.mock("@/client/ClientProvider", () => ({ useClient: () => ({}) }));

/** A client with only what fetchServerEvents touches */
function fakeClient(events: { _id: string; status: string }[]) {
  const kept = new Map<string, unknown>();
  return {
    api: { get: jest.fn(async () => ({ events, answers: [] })) },
    serverEvents: {
      get: (id: string) => kept.get(id),
      forServer: () => [...kept.values()],
      upsert: (e: { _id: string }) => kept.set(e._id, e),
      remove: (id: string) => kept.delete(id),
    },
  } as never;
}

const useProbe = (serverId: string) => ({ loaded: useEventsLoaded(serverId), drafts: useDraftIds(serverId) });

describe("events store hooks", () => {
  beforeEach(() => resetEventsStore());

  it("re-render once a server's events have landed (the list stopped spinning)", async () => {
    const { result } = await renderHook(() => useProbe("S1"));
    expect(result.current).toEqual({ loaded: false, drafts: [] });
    await act(async () => fetchServerEvents(fakeClient([{ _id: "E1", status: "Scheduled" }, { _id: "D1", status: "Draft" }]), "S1", true));
    expect(result.current).toEqual({ loaded: true, drafts: ["D1"] });
  });

  it("keep each server apart", async () => {
    const { result } = await renderHook(() => useProbe("S2"));
    await act(async () => fetchServerEvents(fakeClient([]), "S1", false));
    expect(result.current.loaded).toBe(false);
  });

  it("hand out the same empty drafts list between renders", async () => {
    const { result, rerender } = await renderHook(() => useDraftIds("S3"));
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
