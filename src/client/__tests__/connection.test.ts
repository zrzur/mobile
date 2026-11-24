import { BACKGROUND_GRACE_MS, BANNER_DELAY_MS, bannerDelay, bannerKind, configRetryDelay, mayCloseInBackground, mixHex } from "../connection";

describe("connection rules", () => {
  it("retries the config fetch with growing waits, capped at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(configRetryDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(configRetryDelay(-3)).toBe(1000);
  });

  it("keeps the socket open in the background during a call only", () => {
    expect(mayCloseInBackground("idle")).toBe(true);
    for (const status of ["connecting", "connected", "reconnecting", "disconnected"]) expect(mayCloseInBackground(status)).toBe(false);
    expect(BACKGROUND_GRACE_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("names the connection line like the web titlebar", () => {
    expect(bannerKind("connected", true, false)).toBeNull();
    expect(bannerKind("connecting", false, false)).toBe("connecting");
    expect(bannerKind("connecting", true, false)).toBe("reconnecting");
    expect(bannerKind("offline", false, true)).toBe("offline");
    expect(bannerKind("offline", true, false)).toBe("disconnected");
  });

  it("waits 1.5 s before showing a connecting line, shows problems at once", () => {
    expect(bannerDelay("connecting")).toBe(BANNER_DELAY_MS);
    expect(bannerDelay("reconnecting")).toBe(BANNER_DELAY_MS);
    expect(bannerDelay("offline")).toBe(0);
    expect(bannerDelay("disconnected")).toBe(0);
  });

  it("mixes colours like color-mix in srgb", () => {
    expect(mixHex("#FFFFFF", "#000000", 50)).toBe("#808080");
    expect(mixHex("#F3B96B", "#0D0E16", 0)).toBe("#0D0E16");
    expect(mixHex("#F3B96B", "#0D0E16", 100)).toBe("#F3B96B");
    expect(mixHex("rgba(0,0,0,1)", "#0D0E16", 18)).toBe("#0D0E16");
  });
});
