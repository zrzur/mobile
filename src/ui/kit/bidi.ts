import { Platform, type TextInputProps, type TextStyle } from "react-native";

import { isRTL } from "./direction";

/**
 * Text direction from the text itself, like the web's dir="auto": the first
 * strong letter decides (Unicode bidi rule P2/P3). A Latin name in the Arabic
 * app then keeps its ellipsis at its own end ("Sara Hadd…", not "…a Haddad"),
 * and an Arabic name in the English app reads right to left.
 */

export type TextDir = "ltr" | "rtl";

/** A code point that sets right-to-left (Hebrew, Arabic, Syriac, Thaana, NKo, … and their astral blocks) */
function strongRtl(c: number): boolean {
  if (c === 0x200f || c === 0x061c) return true; // RLM, Arabic letter mark
  if (c >= 0x0590 && c <= 0x08ff) {
    // marks and digits inside those blocks are weak or neutral
    if (c >= 0x0591 && c <= 0x05c7 && c !== 0x05be && c !== 0x05c0 && c !== 0x05c3 && c !== 0x05c6) return false;
    if (c >= 0x0600 && c <= 0x0605) return false;
    if (c >= 0x0610 && c <= 0x061a) return false;
    if (c >= 0x064b && c <= 0x066c) return false; // vowel marks, Arabic-Indic digits and separators
    if (c === 0x0670) return false;
    if (c >= 0x06d6 && c <= 0x06ed && c !== 0x06dd && c !== 0x06e5 && c !== 0x06e6) return false;
    if (c >= 0x06f0 && c <= 0x06f9) return false;
    if (c >= 0x08d3 && c <= 0x08ff) return false;
    return true;
  }
  if (c >= 0xfb1d && c <= 0xfdff) return true;
  if (c >= 0xfe70 && c <= 0xfefe) return true;
  if (c >= 0x10800 && c <= 0x10fff) return true;
  if (c >= 0x1e800 && c <= 0x1efff) return true;
  return false;
}

/** A code point that sets left-to-right: a letter of any other script */
function strongLtr(c: number): boolean {
  if (c === 0x200e) return true; // LRM
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return true;
  if (c === 0xaa || c === 0xb5 || c === 0xba) return true;
  if (c >= 0xc0 && c <= 0x2b8) return c !== 0xd7 && c !== 0xf7;
  if (c >= 0x370 && c <= 0x58f) return c !== 0x375 && c !== 0x37e && c !== 0x384 && c !== 0x385 && c !== 0x387 && !(c >= 0x483 && c <= 0x489);
  if (c >= 0x900 && c <= 0x1fff) return true; // Indic, Thai, Georgian, Hangul Jamo, Ethiopic, Latin and Greek extended, …
  if (c >= 0x2c00 && c <= 0x2dff) return true;
  if (c >= 0x3040 && c <= 0xd7ff) return true; // kana, CJK, Hangul, Yi
  if (c >= 0xf900 && c <= 0xfb1c) return true;
  if ((c >= 0xff21 && c <= 0xff3a) || (c >= 0xff41 && c <= 0xff5a) || (c >= 0xff66 && c <= 0xffdc)) return true;
  if (c >= 0x10000 && c <= 0x107ff) return true;
  if (c >= 0x11000 && c <= 0x1e7ff) return true; // includes the mathematical letters of "fancy" names (𝓢𝓪𝓻𝓪)
  if (c >= 0x20000 && c <= 0x3ffff) return true;
  return false; // digits, punctuation, symbols, emoji, spaces
}

/** Unicode isolates: a piece of text that keeps its own direction inside a sentence (HTML <bdi>, dir="auto" on a span) */
export const FSI = "\u2068";
export const LRI = "\u2066";
export const RLI = "\u2067";
export const PDI = "\u2069";

/** Wrap text people wrote in an isolate, so a name inside a sentence keeps its own direction and does not turn the sentence around */
export function isolate(text: string): string {
  return text ? FSI + text + PDI : text;
}

/**
 * The direction of the first strong letter, or null when there is none
 * (digits, emoji, punctuation only). Text inside isolates is skipped (bidi
 * rule P2, and the web's dir="auto", which skips children with their own dir).
 */
export function firstStrongDirection(text: string): TextDir | null {
  let depth = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0x2066 || c === 0x2067 || c === 0x2068) {
      depth++;
      continue;
    }
    if (c === 0x2069) {
      if (depth > 0) depth--;
      continue;
    }
    if (depth > 0) continue;
    if (strongRtl(c)) return "rtl";
    if (strongLtr(c)) return "ltr";
  }
  return null;
}

/** The text's own direction; text without a letter takes the layout's */
export function textDirection(text: string | null | undefined, fallback: TextDir = isRTL() ? "rtl" : "ltr"): TextDir {
  return (text && firstStrongDirection(text)) || fallback;
}

/**
 * The style that gives a text its own direction while it stays at the start
 * of the layout (an Arabic screen keeps it on the right):
 *
 * - iOS: `writingDirection` is the paragraph's base direction, which places
 *   the ellipsis; `textAlign: "auto"` (natural) is resolved against the
 *   layout direction by React Native, so it stays at the layout's start.
 * - Android: React Native ignores `writingDirection`; its text layout already
 *   uses the first strong letter (FIRSTSTRONG_LTR), and "auto" aligns to the
 *   layout's start. The style is harmless there.
 * - Web (react-native-web): `writingDirection` becomes CSS `direction`, and
 *   `text-align: start` would follow the text, so the side is named.
 */
export function autoDirStyle(text: string | null | undefined, layoutRtl: boolean = isRTL(), platform: string = Platform.OS): TextStyle {
  const writingDirection = textDirection(text, layoutRtl ? "rtl" : "ltr");
  if (platform === "web") return { writingDirection, textAlign: layoutRtl ? "right" : "left" };
  return { writingDirection, textAlign: "auto" };
}

/**
 * The style of a paragraph people wrote: it reads in its own direction AND
 * sits on its own side, like a block with dir="auto" on the web (Arabic on
 * the right in the English app, English on the left in the Arabic app).
 *
 * - Phones: React Native treats textAlign "left" / "right" as the layout's
 *   start / end (both iOS and Android swap them in a right-to-left layout),
 *   so the side is "left" when the text runs with the layout, else "right".
 * - Web (react-native-web): left and right are the real sides.
 */
export function paragraphDirStyle(text: string | null | undefined, layoutRtl: boolean = isRTL(), platform: string = Platform.OS): TextStyle {
  return paragraphSideStyle(textDirection(text, layoutRtl ? "rtl" : "ltr"), layoutRtl, platform);
}

/** paragraphDirStyle for a direction already known */
export function paragraphSideStyle(writingDirection: TextDir, layoutRtl: boolean = isRTL(), platform: string = Platform.OS): TextStyle {
  const layout: TextDir = layoutRtl ? "rtl" : "ltr";
  if (platform === "web") return { writingDirection, textAlign: writingDirection === "rtl" ? "right" : "left" };
  return { writingDirection, textAlign: writingDirection === layout ? "left" : "right" };
}

/** Whether a paragraph in this direction sits at the layout's start (borders and marks go on its start side) */
export function startsAtLayoutStart(dir: TextDir, layoutRtl: boolean = isRTL()): boolean {
  return dir === (layoutRtl ? "rtl" : "ltr");
}

export type DirRun = { dir: TextDir; from: number; to: number };

/**
 * Group lines into runs of one direction. Each line is a paragraph of its own
 * (in plain text a line break ends a bidi paragraph, Unicode rule P1); a line
 * without letters (blank, digits, emoji) keeps the direction of the line
 * before it, or of the first line with letters when it opens the text. A
 * blank line between two directions opens the next run, so the empty line
 * is drawn as a leading line break (a trailing one is dropped on some phones).
 * `to` is exclusive.
 */
export function directionRuns(lines: readonly string[], fallback: TextDir = isRTL() ? "rtl" : "ltr"): DirRun[] {
  const own = lines.map((line) => firstStrongDirection(line));
  const firstKnown = own.find((d) => d !== null) ?? fallback;
  const dirs: TextDir[] = [];
  for (let i = 0; i < lines.length; i++) {
    const d = own[i];
    if (d) {
      dirs.push(d);
      continue;
    }
    // a blank line before a change of direction belongs to the next paragraph
    if (!lines[i].trim()) {
      let j = i + 1;
      while (j < lines.length && !own[j] && !lines[j].trim()) j++;
      const next = j < lines.length ? own[j] : null;
      if (next && i > 0 && next !== dirs[i - 1]) {
        dirs.push(next);
        continue;
      }
    }
    dirs.push(i > 0 ? dirs[i - 1] : firstKnown);
  }
  const runs: DirRun[] = [];
  dirs.forEach((dir, i) => {
    const last = runs[runs.length - 1];
    if (last && last.dir === dir) last.to = i + 1;
    else runs.push({ dir, from: i, to: i + 1 });
  });
  return runs;
}

/**
 * A text that puts people's words inside an interface sentence ("Invite
 * friends to {name}"): the name is isolated so it keeps its own direction,
 * and the sentence takes the direction of the interface words around it.
 * Text that is only the name is returned as it is.
 */
export function isolateWithin(full: string, part: string | null | undefined): string {
  if (!part || full === part) return full;
  const at = full.indexOf(part);
  if (at < 0 || full.includes(FSI + part + PDI)) return full;
  return full.slice(0, at) + isolate(part) + full.slice(at + part.length);
}

/** The plain text of children made of strings and numbers ("" for anything else) */
export function plainText(children: unknown): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(plainText).join("");
  return "";
}

/**
 * The direction of a text field, like dir="auto" on the web's inputs and
 * textareas: an empty field (and its placeholder) starts at the app
 * language's side; once something is typed, its first strong letter decides,
 * live (Arabic on the right, reading right to left, even in the English app;
 * Latin on the left in the Arabic app). Text without letters (digits, emoji)
 * keeps the app's side.
 *
 * `latin` is for fields that only ever hold Latin text (email, password, URL,
 * invite code, numbers): typed text always runs left to right on the left,
 * as dir="ltr" (a password's dots have no direction of their own).
 *
 * Unlike <Text>, a TextInput's textAlign "left" / "right" are the real sides
 * on every platform: iOS builds the field's text attributes from its props
 * without the layout direction, Android maps them to the absolute
 * Gravity.LEFT / RIGHT, and the web build writes them as they are.
 */
export function inputDirStyle(value: string | null | undefined, options: { latin?: boolean; layoutRtl?: boolean } = {}): TextStyle {
  const layout: TextDir = (options.layoutRtl ?? isRTL()) ? "rtl" : "ltr";
  const dir: TextDir = !value ? layout : options.latin ? "ltr" : textDirection(value, layout);
  return inputSideStyle(dir);
}

/** inputDirStyle for a direction already known */
export function inputSideStyle(dir: TextDir): TextStyle {
  return { writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" };
}

const LATIN_KEYBOARDS = new Set(["email-address", "url", "number-pad", "decimal-pad", "numeric", "phone-pad"]);
const LATIN_CONTENT = new Set(["emailAddress", "password", "newPassword", "oneTimeCode", "URL", "telephoneNumber"]);
const LATIN_AUTOCOMPLETE = new Set(["email", "current-password", "new-password", "password", "one-time-code", "url", "tel", "birthdate-year"]);

/** A field whose keyboard or content says it only ever holds Latin text (email, password, URL, numbers, codes) */
export function isLatinInput(p: Pick<TextInputProps, "keyboardType" | "textContentType" | "autoComplete" | "secureTextEntry">): boolean {
  return (
    !!p.secureTextEntry ||
    (!!p.keyboardType && LATIN_KEYBOARDS.has(p.keyboardType)) ||
    (!!p.textContentType && LATIN_CONTENT.has(p.textContentType)) ||
    (!!p.autoComplete && LATIN_AUTOCOMPLETE.has(p.autoComplete))
  );
}
