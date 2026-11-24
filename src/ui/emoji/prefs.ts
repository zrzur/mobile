import { useEffect, useSyncExternalStore } from "react";

import { jsonFile } from "@/chat/persist";

import type { SkinTone } from "./data";

/** A cell of the picker: a Unicode emoji or a server's custom emoji */
export type EmojiEntry = { kind: "unicode"; text: string; name: string } | { kind: "custom"; id: string; name: string };

export type EmojiPrefs = { recent: EmojiEntry[]; favourites: EmojiEntry[]; tone: SkinTone };

export const MAX_RECENT = 24;
export const MAX_FAVOURITES = 32;

export const entryKey = (e: EmojiEntry) => (e.kind === "custom" ? `c:${e.id}` : `u:${e.text}`);

function cleanList(raw: unknown, max: number): EmojiEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: EmojiEntry[] = [];
  for (const e of raw) {
    if (e?.kind === "unicode" && typeof e.text === "string" && typeof e.name === "string") out.push({ kind: "unicode", text: e.text, name: e.name });
    else if (e?.kind === "custom" && /^[0-9A-Z]{26}$/.test(e.id) && typeof e.name === "string") out.push({ kind: "custom", id: e.id, name: e.name });
  }
  return out.slice(0, max);
}

export function cleanPrefs(raw: unknown): EmojiPrefs {
  const r = (raw ?? {}) as Partial<EmojiPrefs>;
  const tone = typeof r.tone === "number" && r.tone >= 0 && r.tone <= 5 ? (Math.round(r.tone) as SkinTone) : 0;
  return { recent: cleanList(r.recent, MAX_RECENT), favourites: cleanList(r.favourites, MAX_FAVOURITES), tone };
}

/** Put an emoji first in a list, once */
export function bump(list: EmojiEntry[], entry: EmojiEntry, max: number) {
  const key = entryKey(entry);
  return [entry, ...list.filter((e) => entryKey(e) !== key)].slice(0, max);
}

const file = jsonFile("zrzur-emoji.json", cleanPrefs);
let prefs: EmojiPrefs = cleanPrefs(undefined);
let loaded = false;
const listeners = new Set<() => void>();

function set(next: EmojiPrefs) {
  prefs = next;
  listeners.forEach((fn) => fn());
  file.write(prefs);
}

/** Read the saved recents, favourites and tone (once) */
function loadPrefs() {
  if (loaded) return;
  loaded = true;
  void file.read().then((saved) => {
    prefs = { ...saved, recent: prefs.recent.length ? prefs.recent : saved.recent };
    listeners.forEach((fn) => fn());
  });
}

export function useEmojiPrefs(): EmojiPrefs {
  useEffect(loadPrefs, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => prefs,
  );
}

export const noteUsed = (entry: EmojiEntry) => set({ ...prefs, recent: bump(prefs.recent, entry, MAX_RECENT) });

export function toggleFavourite(entry: EmojiEntry) {
  const key = entryKey(entry);
  const has = prefs.favourites.some((e) => entryKey(e) === key);
  set({ ...prefs, favourites: has ? prefs.favourites.filter((e) => entryKey(e) !== key) : bump(prefs.favourites, entry, MAX_FAVOURITES) });
}

export const setSkinTone = (tone: SkinTone) => set({ ...prefs, tone });
