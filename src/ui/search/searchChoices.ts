import type { API } from "@zrzur/sdk/solid";

import { type SearchKey, parseSearch } from "./searchSyntax";

/**
 * Where a search looks and how its results are ordered (web: searchChoices.ts).
 * The web keeps them in shared signals; here the search screen holds them in
 * state and hands them to the filter sheet.
 */
export type SearchScope = "channel" | "server";
export type SearchSort = NonNullable<API.DataMessageSearch["sort"]>;

/** A filter as it is written in the search field */
export function writeFilter(key: SearchKey, value: string) {
  return /\s/.test(value) ? `${key}:"${value}"` : `${key}:${value}`;
}

/** The query with one more filter at its end (once only) */
export function addFilter(query: string, key: SearchKey, value: string) {
  const has = parseSearch(query).tokens.some((token) => token.key === key && token.value.toLowerCase() === value.toLowerCase());
  if (has) return query;
  return `${query.trim()} ${writeFilter(key, value)}`.trim();
}

/** The query without the filter `key:value` */
export function removeFilter(query: string, key: SearchKey, value: string) {
  let out = query;
  // from the end, so the positions of the ones before stay right
  for (const token of [...parseSearch(query).tokens].reverse()) {
    if (token.key === key && token.value.toLowerCase() === value.toLowerCase()) out = out.slice(0, token.start) + out.slice(token.end);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The query without any filter of this kind (a day replaces a day) */
export function removeKey(query: string, key: SearchKey) {
  let out = query;
  for (const token of [...parseSearch(query).tokens].reverse()) {
    if (token.key === key) out = out.slice(0, token.start) + out.slice(token.end);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Today (or days ago) as the search writes a day: 2026-11-09, local time */
export function dayValue(daysAgo = 0, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
}

/** Results in channel groups, first seen first (keeps the sort order) */
export function groupByChannel<T extends { channelId: string }>(messages: readonly T[]): { channelId: string; messages: T[] }[] {
  const byChannel = new Map<string, T[]>();
  for (const message of messages) {
    const list = byChannel.get(message.channelId) ?? [];
    list.push(message);
    byChannel.set(message.channelId, list);
  }
  return [...byChannel.entries()].map(([channelId, list]) => ({ channelId, messages: list }));
}

/** One flat list for FlashList: a channel title before each group (server-wide only) */
export type ResultRow = { kind: "channel"; channelId: string } | { kind: "message"; id: string; channelId: string };

export function resultRows<T extends { id: string; channelId: string }>(messages: readonly T[], serverWide: boolean): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const group of groupByChannel(messages)) {
    if (serverWide) rows.push({ kind: "channel", channelId: group.channelId });
    for (const m of group.messages) rows.push({ kind: "message", id: m.id, channelId: m.channelId });
  }
  return rows;
}
