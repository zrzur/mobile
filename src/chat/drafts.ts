/**
 * Unsent text per channel (web: stores/Draft.ts): kept while you move
 * between channels and after the app closes, so nothing typed is lost.
 */
import { jsonFile } from "./persist";

export type Draft = { content: string; at: number };
export type Drafts = Record<string, Draft>;

/** Most drafts kept (the oldest go first) and longest text kept */
export const MAX_DRAFTS = 200;
export const MAX_DRAFT_LENGTH = 20000;

/** Keep only well-formed, non-empty drafts, newest MAX_DRAFTS */
export function cleanDrafts(raw: unknown): Drafts {
  if (!raw || typeof raw !== "object") return {};
  const list: [string, Draft][] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const d = value as Partial<Draft> | null;
    if (!/^[0-9A-Z]{26}$/.test(id) || !d || typeof d.content !== "string" || !d.content.trim()) continue;
    list.push([id, { content: d.content.slice(0, MAX_DRAFT_LENGTH), at: typeof d.at === "number" ? d.at : 0 }]);
  }
  list.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(list.slice(0, MAX_DRAFTS));
}

/** The drafts with one channel's text changed (empty text removes it) */
export function withDraft(drafts: Drafts, channelId: string, content: string, at: number): Drafts {
  const next = { ...drafts };
  if (content.trim()) next[channelId] = { content: content.slice(0, MAX_DRAFT_LENGTH), at };
  else delete next[channelId];
  return next;
}

const file = jsonFile("zrzur-drafts.json", cleanDrafts);
let drafts: Drafts = {};
let loading: Promise<Drafts> | undefined;

/** Load the saved drafts (once) */
export function loadDrafts(): Promise<Drafts> {
  loading ??= file.read().then((saved) => {
    // anything typed before the file was read wins
    drafts = { ...saved, ...drafts };
    return drafts;
  });
  return loading;
}

export function getDraft(channelId: string): string {
  return drafts[channelId]?.content ?? "";
}

export function setDraft(channelId: string, content: string) {
  if ((drafts[channelId]?.content ?? "") === content) return;
  drafts = withDraft(drafts, channelId, content, Date.now());
  file.write(drafts);
}

/** Channels with unsent text (for a drafts list) */
export function draftChannelIds(): string[] {
  return Object.entries(drafts)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => id);
}
