import { type ReactNode, createContext, useContext } from "react";

/**
 * System font size cap for fixed-height chrome (64 px headers, the tab
 * capsule, count badges, chips, pill buttons). Body and message text keep
 * scaling fully; inside a <ChromeScale> every AText stops at this factor, so
 * 200 % system text no longer clips inside the bars.
 */
export const CHROME_MAX_FONT_SCALE = 1.4;

const Cap = createContext<number | undefined>(undefined);

export function ChromeScale({ children, max = CHROME_MAX_FONT_SCALE }: { children: ReactNode; max?: number }) {
  return <Cap.Provider value={max}>{children}</Cap.Provider>;
}

/** The cap that applies here (undefined = text scales freely) */
export function useFontScaleCap(): number | undefined {
  return useContext(Cap);
}
