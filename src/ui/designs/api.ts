/**
 * The community gallery's API (web settings/user/profile/communityApi.ts):
 * the lists of published designs, one design, favourites and a creator's
 * page. Built like Discover's requests (same base address and session
 * headers), because the SDK drops query parameters for routes it does not
 * type; null fields are dropped (web withoutNull).
 */
import type { Client } from "@zrzur/sdk/solid";

export type CommunityKind = "Decoration" | "Nameplate" | "Effect" | "Frame";
export type CommunityListKind =
  "decorations" | "nameplates" | "effects" | "frames";

export type CommunityFile = {
  _id: string;
  metadata?: { width?: number; height?: number; animated?: boolean };
};

/** A design made by a creator */
export type CommunityItem = {
  _id: string;
  kind: CommunityKind;
  name: string;
  creator_id: string;
  file: CommunityFile;
  status: string;
  description?: string;
  tags?: string[];
  published_at?: number;
  popularity: number;
  favourite?: boolean;
};

/** Who made a design: name and avatar, never `username#tag` */
export type CommunityCreator = {
  _id: string;
  display_name?: string;
  avatar?: { _id: string };
  verified?: boolean;
  /** they opened a page of all their work */
  open_page?: boolean;
};

export type CommunityPage = {
  items: CommunityItem[];
  creators: CommunityCreator[];
};
export type CommunityItemDetails = {
  item: CommunityItem;
  creator?: CommunityCreator;
};
export type CreatorProfile = {
  creator: CommunityCreator;
  items: CommunityItem[];
};

export type ListParams = {
  query?: string;
  sort?: "popular";
  favourites?: boolean;
  limit?: number;
  offset?: number;
  creator?: string;
};

type RawApi = { baseURL: string; config: { headers?: Record<string, string> } };

/** Null fields dropped, deeply (web withoutNull) */
export function withoutNull<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutNull) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value))
      if (entry !== null) out[key] = withoutNull(entry);
    return out as T;
  }
  return value;
}

/** `?a=1&b=2` from the set values only */
export function listQuery(params: ListParams): string {
  const pairs = Object.entries(params)
    .filter(
      ([, value]) => value !== undefined && value !== "" && value !== false,
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  return pairs.length ? `?${pairs.join("&")}` : "";
}

/** The base address and session headers of this client */
export function apiBase(client: Client) {
  const api = client.api as unknown as RawApi;
  return { url: api.baseURL, headers: api.config.headers ?? {} };
}

async function request<T>(
  client: Client,
  method: "GET" | "PUT" | "DELETE",
  path: string,
): Promise<T> {
  const { url, headers } = apiBase(client);
  const response = await fetch(`${url}${path}`, { method, headers });
  const text = await response.text();
  if (!response.ok) {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON: the plain text stays the error
    }
    throw typeof parsed === "object" && parsed
      ? { ...(parsed as object), status: response.status }
      : {
          type: response.status === 404 ? "NotFound" : "Unknown",
          status: response.status,
          error: text,
        };
  }
  return withoutNull((text ? JSON.parse(text) : undefined) as T);
}

const id = (value: string) => encodeURIComponent(value);

/**
 * Whether creators' profile frames are open on this server (`GET /`
 * `features.community_frames`). Off, or on a server that does not say, the
 * gallery asks for no frames. Zrzur's own frames do not depend on it.
 */
export function communityFramesOpen(client: Pick<Client, "configuration">) {
  return (
    (
      client.configuration?.features as
        { community_frames?: boolean } | undefined
    )?.community_frames === true
  );
}

/** Name to show for a creator: display name, else username (staff views) */
export function creatorName(creator?: {
  display_name?: string;
  username?: string;
}) {
  return creator?.display_name || creator?.username || "";
}

/** Link to a creator's page only if they opened it */
export const hasOpenPage = (creator?: CommunityCreator) => !!creator?.open_page;

export const communityApi = {
  list: (client: Client, kind: CommunityListKind, params: ListParams) =>
    request<CommunityPage>(
      client,
      "GET",
      `/community/${kind}${listQuery(params)}`,
    ),
  details: (client: Client, itemId: string) =>
    request<CommunityItemDetails>(
      client,
      "GET",
      `/community/items/${id(itemId)}`,
    ),
  favourite: (client: Client, itemId: string, on: boolean) =>
    request<unknown>(
      client,
      on ? "PUT" : "DELETE",
      `/community/items/${id(itemId)}/favourite`,
    ),
  creator: (client: Client, userId: string) =>
    request<CreatorProfile>(client, "GET", `/community/creators/${id(userId)}`),
};
