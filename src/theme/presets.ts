import { DARK, LIGHT, type Palette } from "./palette";

/**
 * The web Appearance presets (ui/themes/appearancePresets.ts and the three
 * listed library themes) mapped onto the phone palette. Midnight Pulse and
 * Daylight are the phone's own DARK and LIGHT; the others recolour them.
 */
export type PresetId = "signature-dark" | "graphite" | "amoled" | "daylight" | "high-contrast" | "paper" | "desert-dawn";
export type ThemeMode = "dark" | "light" | "system";

export type Preset = {
  id: PresetId;
  mode: "dark" | "light";
  /** tile swatches: app / sidebar / chat / raised */
  swatches: [string, string, string, string];
  /** highlight and link dots */
  dots: [string, string];
  accent: string;
  colours?: {
    frame: string;
    floating: string;
    fg: string;
    fg2: string;
    muted: string;
    accentText: string;
    onAccent?: string;
    link: string;
    danger?: string;
  };
};

export const PRESETS: Preset[] = [
  { id: "signature-dark", mode: "dark", swatches: ["#0D0E16", "#171925", "#171925", "#242638"], dots: ["#FF5BA8", "#64A9FF"], accent: "#E0195F" },
  {
    id: "graphite",
    mode: "dark",
    swatches: ["#101114", "#17191E", "#1E2128", "#282C34"],
    dots: ["#FF5BA8", "#64A9FF"],
    accent: "#E0195F",
    colours: { frame: "#101114", floating: "#17191E", fg: "#F0F1F5", fg2: "#B7BAC2", muted: "#A8ADB8", accentText: "#FF7AA8", link: "#64A9FF" },
  },
  {
    id: "amoled",
    mode: "dark",
    swatches: ["#000000", "#070708", "#0E0E10", "#18181C"],
    dots: ["#FF5BA8", "#64A9FF"],
    accent: "#E0195F",
    colours: { frame: "#000000", floating: "#0E0E10", fg: "#F0F1F8", fg2: "#B5B6BD", muted: "#979BB1", accentText: "#FF7AA8", link: "#64A9FF" },
  },
  { id: "daylight", mode: "light", swatches: ["#F1F2F8", "#F3F4FA", "#FFFFFF", "#EEF0F7"], dots: ["#B03C73", "#3F6BA4"], accent: "#C8155A" },
  {
    id: "high-contrast",
    mode: "dark",
    swatches: ["#000000", "#0B0B0B", "#000000", "#1A1A1A"],
    dots: ["#FFD24C", "#7FD4FF"],
    accent: "#4CC2FF",
    colours: { frame: "#000000", floating: "#1A1A1A", fg: "#FFFFFF", fg2: "#F0F0F0", muted: "#BDBDBD", accentText: "#4CC2FF", onAccent: "#000000", link: "#7FD4FF", danger: "#FF8A8A" },
  },
  {
    id: "paper",
    mode: "light",
    swatches: ["#EDE6DA", "#F3EDE3", "#FBF8F2", "#F7F3EC"],
    dots: ["#94491F", "#2B5A9E"],
    accent: "#6A52C7",
    colours: { frame: "#EDE6DA", floating: "#F7F3EC", fg: "#2B2620", fg2: "#5C5348", muted: "#6B6154", accentText: "#6A52C7", link: "#2B5A9E", danger: "#B4233B" },
  },
  {
    id: "desert-dawn",
    mode: "dark",
    swatches: ["#15110D", "#211A14", "#1C1712", "#2A2119"],
    dots: ["#F2C265", "#8FC1E8"],
    accent: "#E0995A",
    colours: { frame: "#15110D", floating: "#2A2119", fg: "#F3E9DC", fg2: "#CBB9A4", muted: "#A99781", accentText: "#E0995A", onAccent: "#1C1208", link: "#8FC1E8", danger: "#F2837B" },
  },
];

/** Accent swatches offered on the Appearance page */
export const ACCENTS = ["#E0195F", "#9075FF", "#FF5BA8", "#4F5DFF", "#6B9CFF", "#3DBFB8", "#3DCF8E", "#E8B44C", "#E07A4F", "#E06B6B", "#9AA4B8"];

export const DEFAULT_PRESET: PresetId = "signature-dark";

export function presetById(id: string | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix two #RRGGBB colours; `amount` 0 = a, 1 = b */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Relative luminance (WCAG) of a #RRGGBB colour */
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** The preset's palette: the base DARK/LIGHT with its surfaces and ink swapped in */
export function presetPalette(preset: Preset): Palette {
  const base = preset.mode === "dark" ? DARK : LIGHT;
  const c = preset.colours;
  if (!c) return base;
  const step = (n: number) => mix(c.frame, c.fg, n);
  return withAccent(
    {
      ...base,
      frame: c.frame,
      field: step(0.05),
      floating: c.floating,
      fg: c.fg,
      header: c.fg,
      fg2: c.fg2,
      muted: c.muted,
      iconMuted: c.muted,
      iconNeutral: mix(c.muted, c.fg, 0.3),
      iconHover: mix(c.fg2, c.fg, 0.5),
      accentText: c.accentText,
      link: c.link,
      danger: c.danger ?? base.danger,
      busy: c.danger ?? base.busy,
      navSelected: step(0.1),
      barFill: step(0.08),
      pill: step(0.15),
      divider: step(0.15),
      borderSoft: step(0.17),
      borderStrong: step(0.22),
      popoverBorder: step(0.16),
      tonal: step(0.17),
      tonalHover: step(0.22),
      unread: c.fg,
    },
    preset.accent,
    c.onAccent,
  );
}

/** Swap the action colour (and its hover, pressed and text shades) */
export function withAccent(palette: Palette, accent: string, onAccent?: string): Palette {
  if (!isHex(accent)) return palette;
  return {
    ...palette,
    accent,
    accentHover: mix(accent, "#000000", 0.1),
    accentPressed: mix(accent, "#000000", 0.2),
    focus: accent,
    accentText: palette.dark ? mix(accent, "#FFFFFF", 0.35) : mix(accent, "#000000", 0.2),
    onAccent: onAccent ?? (luminance(accent) > 0.5 ? "#000000" : "#FFFFFF"),
  };
}

/**
 * The palette for the saved choice. A mode that differs from the preset's
 * own falls back to that mode's default (Midnight Pulse or Daylight).
 */
export function resolvePalette(choice: { preset: string; mode: ThemeMode; accent: string | null }, systemDark: boolean): Palette {
  const wantDark = choice.mode === "system" ? systemDark : choice.mode === "dark";
  let preset = presetById(choice.preset) ?? presetById(DEFAULT_PRESET)!;
  if ((preset.mode === "dark") !== wantDark) preset = presetById(wantDark ? "signature-dark" : "daylight")!;
  const palette = presetPalette(preset);
  return choice.accent ? withAccent(palette, choice.accent) : palette;
}
