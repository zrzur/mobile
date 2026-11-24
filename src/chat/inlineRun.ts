import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from "react";

/**
 * Pieces that sit inside a line of text (system lines, message text): name
 * pills, link chips, custom emoji. Both phone platforms place an inline view
 * with its bottom on the text's baseline (iOS RCTTextLayoutManager: glyph
 * rect bottom plus the font's descender; Android TextLayoutManager:
 * `getLineBaseline(line) - height`). The web instead puts a mention pill on
 * the line's bottom (vertical-align: bottom) and an emoji on the middle
 * (vertical-align: middle). These helpers give the distance to move such a
 * view down so it lands where the web draws it, from the fonts' own metrics.
 */

/** hhea ascender and descender per em (IBM Plex Sans; IBM Plex Sans Arabic) */
export const FONT_METRICS = {
  latin: { ascent: 1.025, descent: 0.275, xHeight: 0.516 },
  arabic: { ascent: 1.085, descent: 0.415, xHeight: 0.516 },
} as const;

function metrics(locale: string) {
  return locale === "ar" ? FONT_METRICS.arabic : FONT_METRICS.latin;
}

/** The line height AText uses: Arabic gets 2 px more */
export function lineFor(locale: string, line: number): number {
  return line + (locale === "ar" ? 2 : 0);
}

const half = (v: number) => Math.round(v * 2) / 2;

/**
 * How far below the baseline the bottom of a line box reaches. A box exactly
 * one line tall with its text centred in it (both platforms centre text in
 * its line height) has its own baseline at the line's baseline when it is
 * moved down by this much: the web's `vertical-align: bottom` pill.
 */
export function lineDescent(locale: string, size: number, line: number): number {
  const m = metrics(locale);
  const l = lineFor(locale, line);
  return half(l / 2 + ((m.descent - m.ascent) * size) / 2);
}

/**
 * How far to move a `height` tall picture down so its middle sits at the
 * baseline plus half the x-height (the web's `vertical-align: middle`).
 */
export function middleDrop(locale: string, size: number, height: number): number {
  return half(height / 2 - (metrics(locale).xHeight * size) / 2);
}

/** No-break space: keeps two pieces of a sentence on the same line */
export const NBSP = " ";

/**
 * Turn the trailing space of a translated sentence into a no-break space, so
 * the piece that follows it (the call's duration) never starts a new line on
 * its own: it wraps together with the last word, as one sentence.
 */
export function glueEnd(node: ReactNode): ReactNode {
  if (typeof node === "string") return node.replace(/[ \t\n]+$/, NBSP);
  if (Array.isArray(node)) {
    if (!node.length) return node;
    const copy = [...node];
    copy[copy.length - 1] = glueEnd(copy[copy.length - 1]);
    return copy;
  }
  // only a fragment is looked into: a pill or other piece stays as it is
  if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment && node.props.children !== undefined) {
    const kids = Children.toArray(node.props.children);
    return cloneElement(node, undefined, ...(glueEnd(kids) as ReactNode[]));
  }
  return node;
}

/**
 * A name written by people inside a sentence (a group name, an event title):
 * first-strong isolation, so an Arabic name in an English sentence (and the
 * other way round) never turns the words around it (the web's dir="auto").
 */
export function isolate(text: string): string {
  return text ? `⁨${text}⁩` : text;
}
