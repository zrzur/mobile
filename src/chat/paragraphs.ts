/**
 * Message text in paragraphs that each read in their own direction, like the
 * web's markdown blocks with dir="auto": an Arabic line sits on the right and
 * runs right to left in the English app, and the other way round.
 *
 * Each line is a bidi paragraph (Unicode rule P1); lines next to each other
 * in one direction are drawn as one Text (see kit/bidi directionRuns).
 */
import { type DirRun, directionRuns, type TextDir } from "@/ui/kit/bidi";

import type { Inline } from "./markdown";

/** Split inline pieces at line breaks; formatting that spans lines is repeated on each line */
export function splitInlineLines(pieces: readonly Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  const push = (piece: Inline) => lines[lines.length - 1].push(piece);
  for (const p of pieces) {
    if (p.t === "text") {
      const parts = p.v.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) push({ t: "text", v: part });
      });
    } else if (p.t === "bold" || p.t === "italic" || p.t === "underline" || p.t === "strike" || p.t === "spoiler") {
      const inner = splitInlineLines(p.c);
      inner.forEach((c, i) => {
        if (i > 0) lines.push([]);
        if (c.length) push({ t: p.t, c });
      });
    } else {
      push(p);
    }
  }
  return lines;
}

/**
 * The text that sets a line's direction. Mentions and custom emoji are left
 * out: on the web they carry their own dir="auto", and dir="auto" skips such
 * children, so "@Sami في مشكلة" reads as Arabic.
 */
export function directionText(pieces: readonly Inline[]): string {
  let out = "";
  for (const p of pieces) {
    switch (p.t) {
      case "text":
      case "code":
        out += p.v;
        break;
      case "link":
        out += p.label ?? p.url;
        break;
      case "bold":
      case "italic":
      case "underline":
      case "strike":
      case "spoiler":
        out += directionText(p.c);
        break;
      default:
        break;
    }
  }
  return out;
}

/** A paragraph block cut into runs of one direction, each with its lines */
export function paragraphRuns(pieces: readonly Inline[], fallback: TextDir): { dir: TextDir; lines: Inline[][] }[] {
  const lines = splitInlineLines(pieces);
  const runs: DirRun[] = directionRuns(
    lines.map((line) => directionText(line)),
    fallback,
  );
  return runs.map((run) => ({ dir: run.dir, lines: lines.slice(run.from, run.to) }));
}
