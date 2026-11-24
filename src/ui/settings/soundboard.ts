/**
 * Pure helpers of the Soundboard page (web: server soundboard settings).
 */

/** Longest sound the server takes */
export const MAX_SOUND_MS = 5200;
/** File size when the instance names none for the `sounds` tag */
export const DEFAULT_SOUND_BYTES = 512000;
export const SOUND_NAME_MAX = 32;
export const SOUND_EMOJI_MAX = 8;
export const LIBRARY_PAGE = 24;

const TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"];
const EXTENSIONS = /\.(mp3|ogg|wav)$/i;

/** An MP3, OGG or WAV file, by its type or else its name */
export function isSoundFile(type: string | null | undefined, name: string | null | undefined): boolean {
  if (type && TYPES.includes(type.toLowerCase())) return true;
  return !!name && EXTENSIONS.test(name);
}

/** The name a picked file suggests: no extension, "-" and "_" as spaces, 32 at most */
export function nameFromFile(file: string): string {
  return [...file.replace(/\.[^./\\]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()].slice(0, SOUND_NAME_MAX).join("").trim();
}

export type SoundProblem = "type" | "size" | "length" | "unreadable";

/** What is wrong with a picked file, in the web's order: type, size, then length */
export function soundProblem(file: { type?: string | null; name?: string | null; size?: number | null }, maxBytes: number, durationMs?: number | null): SoundProblem | undefined {
  if (!isSoundFile(file.type, file.name)) return "type";
  if (typeof file.size === "number" && file.size > maxBytes) return "size";
  if (durationMs === undefined) return undefined;
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) return "unreadable";
  if (durationMs > MAX_SOUND_MS) return "length";
  return undefined;
}

// one pictograph (or a keycap / flag pair), with an optional VS16, skin tone and ZWJ joins
const EMOJI = /^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}️?\p{Emoji_Modifier}?(?:‍\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)*)$/u;

/** Empty, or exactly one emoji */
export function isSingleEmoji(value: string): boolean {
  const v = value.trim();
  return !v || EMOJI.test(v);
}

/** "2.4" for 2400 ms, in the locale's digits */
export function seconds(ms: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000);
}

/** Sounds left; `undefined` when the server names no limit */
export function soundsLeft(limit: number | undefined, count: number): number | undefined {
  return limit ? Math.max(0, limit - count) : undefined;
}

export function isFull(limit: number | undefined, count: number): boolean {
  return !!limit && count >= limit;
}

/** The kilobytes the hints name */
export function kilobytes(bytes: number): number {
  return Math.round(bytes / 1000);
}

type Sound = { _id: string };
type SoundEvent =
  | ({ type: "SoundboardSoundCreate" | "SoundboardSoundUpdate"; server: string } & Sound)
  | { type: "SoundboardSoundDelete"; id: string; server: string }
  | { type: string; server?: string };

/** The list after a realtime soundboard event of this server */
export function applySoundEvent<T extends Sound>(list: T[], event: SoundEvent, serverId: string): T[] {
  if (!("server" in event) || event.server !== serverId) return list;
  if (event.type === "SoundboardSoundDelete" && "id" in event) return list.filter((s) => s._id !== event.id);
  if ((event.type === "SoundboardSoundCreate" || event.type === "SoundboardSoundUpdate") && "_id" in event) {
    const { type: _type, ...rest } = event as unknown as { type: string } & T;
    void _type;
    const sound = rest as unknown as T;
    const at = list.findIndex((s) => s._id === sound._id);
    if (at < 0) return event.type === "SoundboardSoundCreate" ? [...list, sound] : list;
    const next = list.slice();
    next[at] = { ...next[at], ...sound };
    return next;
  }
  return list;
}
