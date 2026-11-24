import { canForwardMessage, forwardTargets, forwardingEnabled, type TargetLike } from "../forward";
import { presetTimes, savedRemindersEnabled } from "../keep";
import { canTrust, isOwnHost, needsConsent, parseOwnPath, parseUrl, scrutiny } from "../links";
import { BULK_DELETE_MAX, pickAll, splitByAge, toggleSelected, ulidTime } from "../selection";
import { PULL_ARMED, PULL_MAX, pullDistance, rowOffset } from "../swipe";

const C = "01J00000000000000000000000";
const M = "01J00000000000000000000001";

describe("links", () => {
  it("reads Zrzur's own channel and message links", () => {
    expect(isOwnHost("app.zrzur.com")).toBe(true);
    expect(isOwnHost("zrzur.example")).toBe(false);
    expect(parseOwnPath(`/server/${C}/channel/${C}/${M}`)).toEqual({ kind: "channel", serverId: C, channelId: C, messageId: M });
    expect(parseOwnPath(`/channel/${C}`)).toEqual({ kind: "channel", channelId: C, messageId: undefined });
    expect(parseOwnPath("/invite/abc123")).toEqual({ kind: "invite", code: "abc123" });
    expect(parseOwnPath("/settings")).toEqual({ kind: "other" });
  });

  it("asks for consent for disguised, insecure and look-alike links", () => {
    const url = parseUrl("https://example.com/a")!;
    expect(scrutiny(url, "https://example.com/a")).toBe(0);
    expect(scrutiny(url, "click here")).toBe(1);
    expect(scrutiny(url, "https://bank.com")).toBe(2);
    expect(needsConsent(url, "click here")).toBe(false);
    expect(needsConsent(url, "https://bank.com")).toBe(true);
    expect(needsConsent(parseUrl("http://example.com")!, undefined)).toBe(true);
    expect(needsConsent(parseUrl("https://xn--pple-43d.com")!, undefined)).toBe(true);
    expect(canTrust(url, undefined)).toBe(true);
    expect(canTrust(parseUrl("http://example.com")!, undefined)).toBe(false);
  });
});

describe("selection", () => {
  it("reads the time from a ULID", () => {
    expect(ulidTime("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(1469918176385);
    expect(Number.isNaN(ulidTime("nope"))).toBe(true);
  });

  it("stops at 100 messages", () => {
    let ids = new Set<string>();
    for (let i = 0; i < BULK_DELETE_MAX; i++) ids = toggleSelected(ids, `m${i}`).ids;
    const r = toggleSelected(ids, "extra");
    expect(r.full).toBe(true);
    expect(r.ids.size).toBe(BULK_DELETE_MAX);
    expect(toggleSelected(r.ids, "m0").ids.has("m0")).toBe(false);
  });

  it("leaves messages older than seven days out", () => {
    const now = ulidTime("01ARYZ6S41TSV4RRFFQ69G5FAV") + 8 * 24 * 3600_000;
    const old = "01ARYZ6S41TSV4RRFFQ69G5FAV";
    const fresh = "01AS9ZZZZZZZZZZZZZZZZZZZZZ";
    expect(splitByAge([old], now)).toEqual({ deletable: [], tooOld: [old] });
    expect(pickAll([old, fresh], ulidTime(fresh) + 1000).ids.has(fresh)).toBe(true);
  });
});

describe("swipe to reply", () => {
  it("follows the finger, then resists, never past the maximum", () => {
    expect(rowOffset(30)).toBe(30);
    expect(rowOffset(PULL_ARMED + 20)).toBeCloseTo(PULL_ARMED + 7);
    expect(rowOffset(500)).toBe(PULL_MAX);
    expect(pullDistance(-40, false)).toBe(40);
    expect(pullDistance(40, false)).toBe(0);
    expect(pullDistance(40, true)).toBe(40);
  });
});

describe("forward", () => {
  const t = (over: Partial<TargetLike>): TargetLike => ({
    id: "x",
    type: "TextChannel",
    name: "general",
    active: true,
    isForum: false,
    mature: false,
    updatedAt: 0,
    canSend: true,
    ...over,
  });

  it("lists writable places, newest first, searched by name", () => {
    const list = forwardTargets(
      [t({ id: "a", updatedAt: 1 }), t({ id: "b", updatedAt: 5, name: "news" }), t({ id: "c", canSend: false }), t({ id: "d", type: "DirectMessage", active: false }), t({ id: "e", type: "VoiceChannel" })],
      "",
      false,
    );
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    expect(forwardTargets([t({ id: "a" }), t({ id: "b", name: "news" })], "NEW", false).map((x) => x.id)).toEqual(["b"]);
    expect(forwardTargets([t({ id: "a" }), t({ id: "m", mature: true })], "", true).map((x) => x.id)).toEqual(["m"]);
  });

  it("needs content and a clear yes from the server", () => {
    expect(canForwardMessage({ content: " " })).toBe(false);
    expect(canForwardMessage({ content: "hi" })).toBe(true);
    expect(canForwardMessage({ content: "hi", systemMessage: {} })).toBe(false);
    expect(forwardingEnabled({ configuration: { features: { forwarding: true } } })).toBe(true);
    expect(forwardingEnabled({ configuration: { features: {} } })).toBe(false);
    expect(savedRemindersEnabled(undefined)).toBe(false);
  });
});

describe("reminder presets", () => {
  it("offers tonight only until half an hour before 20:00", () => {
    expect(presetTimes(new Date(2026, 10, 22, 12, 0)).map((p) => p.preset)).toEqual(["20m", "1h", "tonight", "morning"]);
    expect(presetTimes(new Date(2026, 10, 22, 19, 45)).map((p) => p.preset)).toEqual(["20m", "1h", "morning"]);
  });

  it("past midnight, the morning is the same day", () => {
    const morning = presetTimes(new Date(2026, 10, 22, 2, 0)).find((p) => p.preset === "morning")!;
    expect(morning.sameDay).toBe(true);
    expect(morning.at.getDate()).toBe(22);
    expect(presetTimes(new Date(2026, 10, 22, 12, 0)).find((p) => p.preset === "morning")!.at.getDate()).toBe(23);
  });
});
