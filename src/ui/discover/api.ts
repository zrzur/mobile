import type { Client } from "@zrzur/sdk/solid";

import { type BotInvite, type DiscoverBot, type DiscoverKind, type DiscoverQuery, type DiscoverServer, queryString } from "./logic";

type RawApi = { baseURL: string; config: { headers?: Record<string, string> } };

/**
 * A Discover request (web: discoverRequest). The SDK's API drops query
 * parameters for routes missing from its route table, so Discover builds its
 * own (same base address and session headers). A failure throws the server's
 * error body, which `toAuthError` and `describeError` read like any other.
 */
export async function discoverRequest<T>(client: Client, method: "GET" | "POST", path: string, query: DiscoverQuery = {}, body?: unknown): Promise<T> {
  const api = client.api as unknown as RawApi;
  const response = await fetch(`${api.baseURL}${path}${queryString(query)}`, {
    method,
    headers: { ...(api.config.headers ?? {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON: the plain text stays the error
    }
    throw typeof parsed === "object" && parsed ? { ...(parsed as object), status: response.status } : { type: response.status === 404 ? "NotFound" : "Unknown", status: response.status, error: text };
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/** The paid top row */
export type PromotedRow<T> = { slots: number; open: number; servers?: T[]; bots?: T[] };

export const discoverApi = {
  servers: (client: Client, query: DiscoverQuery) => discoverRequest<DiscoverServer[]>(client, "GET", "/discover/servers", query),
  bots: (client: Client, query: DiscoverQuery) => discoverRequest<DiscoverBot[]>(client, "GET", "/discover/bots", query),
  server: (client: Client, id: string) => discoverRequest<DiscoverServer>(client, "GET", `/discover/servers/${encodeURIComponent(id)}`),
  bot: (client: Client, id: string) => discoverRequest<DiscoverBot>(client, "GET", `/discover/bots/${encodeURIComponent(id)}`),
  botInvite: (client: Client, id: string) => discoverRequest<BotInvite>(client, "GET", `/bots/${encodeURIComponent(id)}/invite`),
  botCommands: (client: Client, id: string) =>
    discoverRequest<{ name: string; description?: string; description_localizations?: Record<string, string> | null; type?: string }[]>(client, "GET", `/bots/${encodeURIComponent(id)}/commands`),
  promoted: (client: Client) => discoverRequest<PromotedRow<DiscoverServer>>(client, "GET", "/discover/promoted"),
  promotedBots: (client: Client) => discoverRequest<PromotedRow<DiscoverBot>>(client, "GET", "/discover/promoted/bots"),
  /** Count a view (top row) or a click (opened) for a promoted listing */
  event: (client: Client, kind: DiscoverKind, id: string, action: "view" | "click") =>
    discoverRequest<unknown>(client, "POST", `/discover/${kind}/${encodeURIComponent(id)}/events`, {}, { kind: action }),
};
