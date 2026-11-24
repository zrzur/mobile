import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { isWide } from "@/ui/app/useWide";
import { SCREEN_KINDS, screenMotion } from "@/ui/app/transitions";

import { haptics, setHapticsEnabled } from "../haptics";
import { isWebLink } from "../openLink";
import { cacheName } from "../share";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("@/lib/secureStorage", () => ({ secureStorage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), remove: () => Promise.resolve() } }));

describe("haptics", () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    setHapticsEnabled(true);
    jest.clearAllMocks();
  });

  it("taps on a phone", () => {
    Platform.OS = "ios";
    haptics.selection();
    haptics.success();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("does nothing on the web", () => {
    Platform.OS = "web";
    haptics.selection();
    haptics.medium();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("does nothing when switched off", () => {
    Platform.OS = "ios";
    setHapticsEnabled(false);
    haptics.error();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe("screen transitions", () => {
  it("tabs cross-fade, pages push natively, tasks are modal", () => {
    expect(screenMotion("tab", { reduce: false, wide: false, os: "ios" }).animation).toBe("fade");
    expect(screenMotion("push", { reduce: false, wide: false, os: "ios" })).toMatchObject({ animation: "default", gestureEnabled: true });
    expect(screenMotion("modal", { reduce: false, wide: false, os: "ios" })).toMatchObject({ presentation: "modal" });
    expect(screenMotion("modal", { reduce: false, wide: false, os: "android" })).toMatchObject({ animation: "slide_from_bottom" });
  });

  it("reduce motion fades everything", () => {
    for (const kind of ["tab", "push", "modal"] as const) expect(screenMotion(kind, { reduce: true, wide: false, os: "ios" }).animation).toBe("fade");
  });

  it("the split view's right pane fades", () => {
    expect(screenMotion("push", { reduce: false, wide: true, os: "ios" }).animation).toBe("fade");
  });

  it("knows the tab and task routes", () => {
    expect(SCREEN_KINDS.home).toBe("tab");
    expect(SCREEN_KINDS["server/[id]"]).toBe("tab");
    expect(SCREEN_KINDS["add-server"]).toBe("modal");
    expect(SCREEN_KINDS["channel/[id]"]).toBeUndefined();
  });
});

describe("links and files", () => {
  it("tells web links from others", () => {
    expect(isWebLink("https://zrzur.com")).toBe(true);
    expect(isWebLink(" HTTP://example.org/a")).toBe(true);
    expect(isWebLink("mailto:support@zrzur.com")).toBe(false);
    expect(isWebLink("otpauth://totp/x")).toBe(false);
  });

  it("makes safe cache names that keep the extension", () => {
    expect(cacheName("photo.jpg", "https://cdn/x")).toBe("photo.jpg");
    expect(cacheName(undefined, "https://cdn.zrzur.com/attachments/a%20b.png?x=1")).toBe("a b.png");
    expect(cacheName("a/b:c?.png", "https://x")).toBe("a_b_c_.png");
    expect(cacheName("", "https://x/")).toBe("file");
  });
});

describe("wide layout", () => {
  it("needs both room across and height", () => {
    expect(isWide(1024, 768)).toBe(true);
    expect(isWide(768, 1024)).toBe(true);
    expect(isWide(694, 768)).toBe(false);
    expect(isWide(850, 390)).toBe(false);
  });
});
