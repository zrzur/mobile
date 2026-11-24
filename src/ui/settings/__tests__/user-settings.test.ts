import { i18n } from "@lingui/core";

import { DARK, LIGHT } from "@/theme/palette";
import { ACCENTS, PRESETS, luminance, mix, presetPalette, resolvePalette, withAccent } from "@/theme/presets";

import {
  DATETIME_DEFAULTS,
  SOUND_DEFAULTS,
  VOICE_DEFAULTS,
  bugReady,
  decisionReference,
  eventNoticesValue,
  formatPattern,
  formatPrice,
  megabytes,
  parseEventNotices,
  periodActive,
  readPrefs,
  snap,
  streamQuality,
  syncedValue,
  ticketReady,
} from "../user/userPrefs";
import { userSectionAllowed, userSectionGroups, userSections } from "../userSections";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

describe("user settings list", () => {
  it("lists the phone pages in web order and hides tab-only pages", () => {
    const groups = userSectionGroups(userSections(i18n, { billing: false, video: true }));
    expect(groups.map(([c]) => c)).toEqual(["User settings", "Help & safety", "Client settings"]);
    expect(groups.flatMap(([, l]) => l.map((s) => s.id))).toEqual(["profile", "sessions", "connections", "connected-apps", "my-data", "support", "feedback", "voice", "appearance", "notifications", "data", "language"]);
  });

  it("shows Feather only where billing is on", () => {
    const off = userSections(i18n, { billing: false, video: true });
    const on = userSections(i18n, { billing: true, video: true });
    expect(userSectionAllowed(off, "plus")).toBe(false);
    expect(userSectionAllowed(off, "subscriptions")).toBe(false);
    expect(userSectionAllowed(on, "plus")).toBe(true);
    expect(userSectionGroups(on).map(([c]) => c)).toContain("Subscriptions");
    // the tab page stays reachable but is no row
    expect(userSectionGroups(on).flatMap(([, l]) => l.map((s) => s.id))).not.toContain("subscriptions");
  });

  it("names Voice by the video limit and never lists excluded pages", () => {
    const noVideo = userSections(i18n, { billing: true, video: false });
    expect(noVideo.find((s) => s.id === "voice")?.title).toBe("Voice");
    expect(userSections(i18n, { billing: true, video: true }).find((s) => s.id === "voice")?.title).toBe("Voice & Video");
    for (const id of ["safety", "keybinds", "native", "advanced"]) expect(userSectionAllowed(noVideo, id)).toBe(false);
  });
});

describe("device preferences", () => {
  it("reads stored JSON over defaults and drops wrong types and unknown keys", () => {
    expect(readPrefs(null, VOICE_DEFAULTS)).toEqual(VOICE_DEFAULTS);
    expect(readPrefs("not json", SOUND_DEFAULTS)).toEqual(SOUND_DEFAULTS);
    expect(readPrefs("[1,2]", SOUND_DEFAULTS)).toEqual(SOUND_DEFAULTS);
    const v = readPrefs(JSON.stringify({ inputVolume: 2.5, threshold: "loud", extra: 1 }), VOICE_DEFAULTS);
    expect(v.inputVolume).toBe(2.5);
    expect(v.threshold).toBe(-50);
    expect("extra" in v).toBe(false);
    expect(readPrefs(JSON.stringify({ date: "YYYY-MM-DD" }), DATETIME_DEFAULTS)).toEqual({ date: "YYYY-MM-DD", time: "HH:mm" });
  });

  it("snaps slider values to the step inside the range", () => {
    expect(snap(1.2345, 0, 3, 0.1)).toBe(1.2);
    expect(snap(5, 0, 3, 0.1)).toBe(3);
    expect(snap(-90, -80, 0, 1)).toBe(-80);
    expect(snap(0.33, 0, 1, 0.05)).toBe(0.35);
  });

  it("formats the date and time samples", () => {
    const d = new Date(2026, 11, 31, 18, 5);
    expect(formatPattern("DD/MM/YYYY", d)).toBe("31/12/2026");
    expect(formatPattern("MM/DD/YYYY", d)).toBe("12/31/2026");
    expect(formatPattern("YYYY-MM-DD", d)).toBe("2026-12-31");
    expect(formatPattern("HH:mm", d)).toBe("18:05");
    expect(formatPattern("h:mm A", d)).toBe("6:05 PM");
    expect(formatPattern("h:mm A", new Date(2026, 0, 1, 0, 7))).toBe("12:07 AM");
  });
});

describe("event notices (synced)", () => {
  it("defaults every switch on and keeps only the off ones", () => {
    expect(parseEventNotices(undefined)).toEqual({ reminders: true, changes: true, invitations: true, seats: true });
    expect(parseEventNotices("{broken")).toEqual({ reminders: true, changes: true, invitations: true, seats: true });
    const state = parseEventNotices('{"seats":false,"other":false}');
    expect(state.seats).toBe(false);
    expect(eventNoticesValue(state)).toBe('{"seats":false}');
    expect(eventNoticesValue(parseEventNotices(undefined))).toBe("{}");
  });

  it("reads the value out of the sync answer", () => {
    expect(syncedValue({ event_notices: [123, '{"seats":false}'] }, "event_notices")).toBe('{"seats":false}');
    expect(syncedValue({}, "event_notices")).toBeUndefined();
    expect(syncedValue(null, "event_notices")).toBeUndefined();
  });
});

describe("Feather, safety and forms", () => {
  it("formats prices, sizes and stream quality", () => {
    expect(formatPrice(499, "EUR", "en")).toBe("€4.99");
    expect(formatPrice(499, "NOPE", "en")).toBe("4.99");
    expect(megabytes(20_000_000)).toBe("20 MB");
    expect(streamQuality({ video_resolution: [1920, 1080], video_framerate: 60 })).toBe("1080p60");
    expect(periodActive("2026-12-01T00:00:00Z", Date.parse("2026-11-23T00:00:00Z"))).toBe(true);
    expect(periodActive("2026-11-01T00:00:00Z", Date.parse("2026-11-23T00:00:00Z"))).toBe(false);
    expect(periodActive(null, 0)).toBe(false);
  });

  it("builds the decision reference like the e-mail", () => {
    expect(decisionReference("01HXYZabcdef1234")).toBe("ZR-CDEF1234");
  });

  it("checks bug and ticket limits", () => {
    expect(bugReady({ title: "Crash", description: "It crashes on start" })).toBe(true);
    expect(bugReady({ title: "Bad", description: "It crashes on start" })).toBe(false);
    expect(bugReady({ title: "Crash", description: "short" })).toBe(false);
    expect(ticketReady("Hi", "Help me")).toBe(true);
    expect(ticketReady("  ", "Help me")).toBe(false);
    expect(ticketReady("x".repeat(121), "Help")).toBe(false);
  });
});

describe("appearance presets", () => {
  it("keeps Midnight Pulse and Daylight as the phone palettes", () => {
    expect(presetPalette(PRESETS[0])).toBe(DARK);
    expect(presetPalette(PRESETS.find((p) => p.id === "daylight")!)).toBe(LIGHT);
  });

  it("recolours the other presets from their surfaces", () => {
    const amoled = presetPalette(PRESETS.find((p) => p.id === "amoled")!);
    expect(amoled.frame).toBe("#000000");
    expect(amoled.dark).toBe(true);
    const paper = presetPalette(PRESETS.find((p) => p.id === "paper")!);
    expect(paper.dark).toBe(false);
    expect(paper.accent).toBe("#6A52C7");
    const contrast = presetPalette(PRESETS.find((p) => p.id === "high-contrast")!);
    expect(contrast.onAccent).toBe("#000000");
  });

  it("falls back to the default of the chosen mode", () => {
    expect(resolvePalette({ preset: "graphite", mode: "light", accent: null }, true)).toBe(LIGHT);
    expect(resolvePalette({ preset: "paper", mode: "system", accent: null }, true)).toBe(DARK);
    expect(resolvePalette({ preset: "paper", mode: "system", accent: null }, false).frame).toBe("#EDE6DA");
    expect(resolvePalette({ preset: "nope", mode: "dark", accent: null }, false)).toBe(DARK);
  });

  it("swaps the accent and picks readable text on it", () => {
    const p = resolvePalette({ preset: "signature-dark", mode: "dark", accent: "#3DCF8E" }, true);
    expect(p.accent).toBe("#3DCF8E");
    expect(withAccent(DARK, "bad").accent).toBe(DARK.accent);
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(luminance("#FFFFFF")).toBeCloseTo(1);
    for (const a of ACCENTS) expect(/^#[0-9A-F]{6}$/i.test(a)).toBe(true);
  });
});
