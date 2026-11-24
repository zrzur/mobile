/**
 * Composer limits (web: Composition.tsx): the length counter shows in the
 * last 200 characters, past the limit the send button is off, far past it
 * the counter just says "Too long". Files over the upload limit are refused
 * before they upload.
 */

/** Used when the server did not say (the backend's default) */
export const DEFAULT_MESSAGE_LENGTH = 2000;
export const DEFAULT_ATTACHMENTS = 5;

export type LengthState = { show: false } | { show: true; left: number; over: boolean; wayOver: boolean };

export function lengthState(length: number, max: number): LengthState {
  if (length <= max - 200) return { show: false };
  return { show: true, left: max - length, over: length > max, wayOver: length > max + 9999 };
}

/** Bytes as people read them (web: humanFileSize, 1024 steps) */
export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
  return `${text} ${units[unit]}`;
}

/** Split picked files into those under the limit and those over it (size unknown passes) */
export function splitBySize<T extends { size?: number }>(files: T[], max: number | undefined): { ok: T[]; tooLarge: T[] } {
  if (!max) return { ok: files, tooLarge: [] };
  const ok: T[] = [];
  const tooLarge: T[] = [];
  for (const f of files) (f.size !== undefined && f.size > max ? tooLarge : ok).push(f);
  return { ok, tooLarge };
}
