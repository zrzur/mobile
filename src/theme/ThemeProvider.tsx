import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";

import { secureStorage } from "@/lib/secureStorage";

import { DARK, type Palette } from "./palette";
import { DEFAULT_PRESET, type ThemeMode, isHex, presetById, resolvePalette } from "./presets";

const THEME_KEY = "zrzur.theme";
const APPEARANCE_KEY = "zrzur.appearance";

export type Animations = "off" | "auto" | "on";
export type ReduceMotion = "device" | "reduce" | "full";

/** What the Appearance page saves (device only, like the web `theme` store) */
export type Appearance = {
  preset: string;
  mode: ThemeMode;
  /** null = the preset's own accent */
  accent: string | null;
  animations: Animations;
  reduceMotion: ReduceMotion;
};

export const DEFAULT_APPEARANCE: Appearance = { preset: DEFAULT_PRESET, mode: "dark", accent: null, animations: "off", reduceMotion: "device" };

type ThemeValue = {
  palette: Palette;
  toggle(): void;
  appearance: Appearance;
  setAppearance(patch: Partial<Appearance>): void;
};

const ThemeContext = createContext<ThemeValue>({ palette: DARK, toggle: () => {}, appearance: DEFAULT_APPEARANCE, setAppearance: () => {} });

/** Read a saved appearance, keeping only valid fields */
export function readAppearance(raw: string | null, legacyTheme: string | null): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE, mode: legacyTheme === "light" ? "light" : "dark" };
  if (legacyTheme === "light") out.preset = "daylight";
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Appearance, unknown>>;
    if (typeof v.preset === "string" && presetById(v.preset)) out.preset = v.preset;
    if (v.mode === "dark" || v.mode === "light" || v.mode === "system") out.mode = v.mode;
    if (v.accent === null || isHex(v.accent)) out.accent = v.accent as string | null;
    if (v.animations === "off" || v.animations === "auto" || v.animations === "on") out.animations = v.animations;
    if (v.reduceMotion === "device" || v.reduceMotion === "reduce" || v.reduceMotion === "full") out.reduceMotion = v.reduceMotion;
  } catch {
    // a broken value falls back to the defaults
  }
  return out;
}

/** Dark by default, like the web app; the auth pages switch it with the moon button */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const system = useColorScheme();

  useEffect(() => {
    Promise.all([secureStorage.get(APPEARANCE_KEY), secureStorage.get(THEME_KEY)])
      .then(([raw, legacy]) => setState(readAppearance(raw, legacy)))
      .catch(() => {});
  }, []);

  const palette = useMemo(() => resolvePalette(appearance, system !== "light"), [appearance, system]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.style.colorScheme = palette.dark ? "dark" : "light";
      document.body.style.backgroundColor = palette.frame;
    }
  }, [palette]);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      void secureStorage.set(APPEARANCE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      palette,
      appearance,
      setAppearance,
      toggle() {
        const dark = !palette.dark;
        void secureStorage.set(THEME_KEY, dark ? "dark" : "light").catch(() => {});
        setAppearance({ mode: dark ? "dark" : "light" });
      },
    }),
    [palette, appearance, setAppearance],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
