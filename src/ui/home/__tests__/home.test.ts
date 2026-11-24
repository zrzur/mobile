import { greetingKind } from "../greeting";
import { phoneOffline, withPhoneNetwork } from "../network";
import { shouldCheckUpdate, UPDATE_CHECK_GAP_MS } from "../updateCheck";

// hoisted by jest above the imports
jest.mock("expo-updates", () => ({ isEnabled: true, checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn() }));

describe("greeting", () => {
  it("follows the hour like the web", () => {
    expect(greetingKind(0)).toBe("late");
    expect(greetingKind(4)).toBe("late");
    expect(greetingKind(5)).toBe("morning");
    expect(greetingKind(11)).toBe("morning");
    expect(greetingKind(12)).toBe("afternoon");
    expect(greetingKind(17)).toBe("afternoon");
    expect(greetingKind(18)).toBe("evening");
    expect(greetingKind(23)).toBe("evening");
  });
});

describe("phone network on the connection line", () => {
  it("says offline at once when the phone has no network", () => {
    expect(withPhoneNetwork("reconnecting", { isConnected: false })).toBe("offline");
    expect(withPhoneNetwork("connecting", { isConnected: true, isInternetReachable: false })).toBe("offline");
  });
  it("keeps the app's own word otherwise, and never shows a line when connected", () => {
    expect(withPhoneNetwork("reconnecting", { isConnected: true, isInternetReachable: true })).toBe("reconnecting");
    expect(withPhoneNetwork("disconnected", undefined)).toBe("disconnected");
    expect(withPhoneNetwork(null, { isConnected: false })).toBeNull();
  });
  it("counts unknown as online", () => {
    expect(phoneOffline({})).toBe(false);
    expect(phoneOffline(undefined)).toBe(false);
  });
});

describe("update checks", () => {
  it("looks at start, then at most every half hour, never when updates are off", () => {
    expect(shouldCheckUpdate(undefined, 1000, true)).toBe(true);
    expect(shouldCheckUpdate(1000, 1000 + UPDATE_CHECK_GAP_MS - 1, true)).toBe(false);
    expect(shouldCheckUpdate(1000, 1000 + UPDATE_CHECK_GAP_MS, true)).toBe(true);
    expect(shouldCheckUpdate(undefined, 1000, false)).toBe(false);
  });
});
