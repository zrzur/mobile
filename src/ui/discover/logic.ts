/**
 * Discover, the pure part (web: interface/discover/{api,categories,marks,
 * find,plainText}.ts and modals/addBotPermissions.ts): the listing shape,
 * topics, marks, search on what is already on screen, and the permissions a
 * bot asks for. No React here, so the tests read it directly.
 */

export type DiscoverKind = "servers" | "bots";
export type ApiFile = { _id: string } | null | undefined;
export type Boost = "Boost" | "SuperBoost" | "MegaBoost";

export type DiscoverServer = {
  _id: string;
  name: string;
  description?: string | null;
  icon?: ApiFile;
  banner?: ApiFile;
  flags?: number | null;
  nsfw?: boolean;
  member_count: number;
  online_count?: number | null;
  link?: string | null;
  tags?: string[];
  category?: string | null;
  language?: string | null;
  featured?: boolean;
  boost?: Boost | null;
  promoted?: boolean;
};

export type DiscoverBot = {
  _id: string;
  username: string;
  avatar?: ApiFile;
  banner?: ApiFile;
  description?: string | null;
  server_count: number;
  verified?: boolean;
  tags?: string[];
  category?: string | null;
  language?: string | null;
  featured?: boolean;
  boost?: Boost | null;
  promoted?: boolean;
};

/** What a bot's public invite says about it */
export type BotInvite = { default_permissions?: number; privacy_policy_url?: string; terms_of_service_url?: string };

/** One card's data, the same for servers and bots (web: Listing) */
export type Listing = {
  kind: DiscoverKind;
  id: string;
  name: string;
  description?: string;
  icon?: ApiFile;
  banner?: ApiFile;
  verified: boolean;
  /** Zrzur's own server: the official mark, not the verified seal */
  official?: boolean;
  featured: boolean;
  boost?: Boost;
  promoted?: boolean;
  tags: string[];
  category?: string;
  language?: string;
  count: number;
  /** members online now (approximate; servers only) */
  online?: number;
  /** custom link name, for the page address */
  link?: string;
};

/** Server flags (SDK ServerFlags): Official = 1, Verified = 2 */
const OFFICIAL = 1;
const VERIFIED = 2;

export function fromServer(server: DiscoverServer): Listing {
  const flags = server.flags ?? 0;
  return {
    kind: "servers",
    id: server._id,
    name: server.name,
    description: server.description ?? undefined,
    icon: server.icon,
    banner: server.banner,
    verified: !!(flags & (VERIFIED | OFFICIAL)),
    official: !!(flags & OFFICIAL),
    featured: !!server.featured,
    boost: server.boost ?? undefined,
    promoted: server.promoted,
    tags: server.tags ?? [],
    category: server.category ?? undefined,
    language: server.language ?? undefined,
    count: server.member_count ?? 0,
    online: server.online_count ?? undefined,
    link: server.link ?? undefined,
  };
}

export function fromBot(bot: DiscoverBot): Listing {
  return {
    kind: "bots",
    id: bot._id,
    name: bot.username,
    description: bot.description ?? undefined,
    icon: bot.avatar,
    banner: bot.banner,
    verified: !!bot.verified,
    featured: !!bot.featured,
    boost: bot.boost ?? undefined,
    promoted: bot.promoted,
    tags: bot.tags ?? [],
    category: bot.category ?? undefined,
    language: bot.language ?? undefined,
    count: bot.server_count ?? 0,
  };
}

/** Topics; must match DISCOVER_SERVER_CATEGORIES / DISCOVER_BOT_CATEGORIES in the API */
export const CATEGORIES: Record<DiscoverKind, { id: string; icon: string }[]> = {
  servers: [
    { id: "gaming", icon: "game-controller" },
    { id: "community", icon: "users-three" },
    { id: "education", icon: "books" },
    { id: "technology", icon: "cpu" },
    { id: "art", icon: "paint-brush" },
    { id: "music", icon: "music-note" },
    { id: "entertainment", icon: "confetti" },
    { id: "anime", icon: "sparkle" },
    { id: "sports", icon: "medal" },
    { id: "science", icon: "flask" },
    { id: "languages", icon: "translate" },
    { id: "other", icon: "squares-four" },
  ],
  bots: [
    { id: "moderation", icon: "shield-check" },
    { id: "utility", icon: "wrench" },
    { id: "fun", icon: "smiley" },
    { id: "music", icon: "music-note" },
    { id: "games", icon: "game-controller" },
    { id: "social", icon: "chats-circle" },
    { id: "other", icon: "squares-four" },
  ],
};

export function categoryIcon(kind: DiscoverKind, id?: string): string {
  return CATEGORIES[kind].find((c) => c.id === id)?.icon ?? "squares-four";
}

/** Results per page (web PAGE_SIZE) */
export const PAGE_SIZE = 24;

/** What the list asks the API for */
export type DiscoverQuery = {
  query?: string;
  category?: string;
  tag?: string;
  language?: string;
  featured?: boolean;
  sort?: "popular" | "new";
  limit?: number;
  offset?: number;
};

/** The query string of a Discover request; empty values are left out */
export function queryString(query: DiscoverQuery): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// marks ------------------------------------------------------------------

export type MarkInput = { promoted?: boolean; boost?: Boost; featured?: boolean; kind?: DiscoverKind };
export type ListingMarkKind = "promoted" | "headline" | "spotlight" | "boosted" | "picked";

/** The paid or hand-picked mark a listing carries, strongest first */
export function listingMark(listing: MarkInput): ListingMarkKind | undefined {
  if (listing.promoted) return "promoted";
  if (listing.boost === "MegaBoost") return "headline";
  if (listing.boost === "SuperBoost") return "spotlight";
  if (listing.boost) return "boosted";
  if (listing.featured) return "picked";
  return undefined;
}

/** Paid places always carry "Ad" and "Why am I seeing this?"; hand-picked is free */
export function isPaidMark(mark: ListingMarkKind | undefined): boolean {
  return mark !== undefined && mark !== "picked";
}
export const isPaidListing = (listing: MarkInput) => isPaidMark(listingMark(listing));

/** The one mark beside a listing's name: official, verified server or verified bot */
export function listingBadge(listing: { kind?: DiscoverKind; verified?: boolean; official?: boolean }) {
  if (!listing.verified && !listing.official) return undefined;
  if (listing.kind === "bots") return "bot_verified" as const;
  return listing.official ? ("server_official" as const) : ("server_verified" as const);
}

// search -----------------------------------------------------------------

type Findable = { id: string; name: string; description?: string; tags: string[] };

/** Arabic as people type it: no vowel marks, any alef, ya or ta marbuta */
export function normalise(text: string): string {
  return text
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word typed is found somewhere; the name counts most */
export function score(item: Findable, query: string): number {
  const words = normalise(query).replace(/^#/, "").split(" ").filter(Boolean);
  if (!words.length) return 0;
  const name = normalise(item.name);
  const tags = item.tags.map(normalise);
  const about = normalise(item.description ?? "");
  let total = 0;
  for (const word of words) {
    if (name.startsWith(word)) total += 8;
    else if (name.includes(word)) total += 5;
    else if (tags.some((tag) => tag.startsWith(word))) total += 4;
    else if (about.includes(word)) total += 1;
    else return 0;
  }
  return total;
}

/** The items that match, best first, each one once */
export function findLocal<T extends Findable>(items: T[], query: string): T[] {
  const best = new Map<string, { item: T; points: number }>();
  for (const item of items) {
    const points = score(item, query);
    if (points && !best.has(item.id)) best.set(item.id, { item, points });
  }
  return [...best.values()].sort((a, b) => b.points - a.points).map((entry) => entry.item);
}

/** The API's order first, then what only this page knew about */
export function mergeResults<T extends { id: string }>(answered: T[], local: T[]): T[] {
  const ids = new Set(answered.map((item) => item.id));
  return [...answered, ...local.filter((item) => !ids.has(item.id))];
}

/** Keeps the first time each listing appears, across lists */
export function once<T extends { id: string }>(items: T[], seen: Set<string>): T[] {
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * What the browse page shows (web Discover `page`): the headline first, then
 * the paid top row, hand-picked, and all the rest by members. A listing
 * appears once.
 */
export function browsePage(lists: { popular: Listing[]; featured: Listing[]; fresh: Listing[]; topRow: Listing[] }) {
  const seen = new Set<string>();
  const paid = [...lists.popular, ...lists.featured].find((item) => item.boost === "MegaBoost");
  if (paid) seen.add(paid.id);
  const topRow = once(lists.topRow, seen);
  const picked = once(lists.featured, seen);
  return { paid, topRow, picked, list: once([...lists.popular, ...lists.featured, ...lists.fresh], seen) };
}

/** Slash commands a bot's description mentions (fallback when its commands can't be read) */
export function commandsIn(description?: string, limit = 8): string[] {
  const found = new Set<string>();
  const pattern = /(?:^|[\s(،,:;؛"«]|(?<=\s)و)\/([\p{L}\p{N}][\p{L}\p{N}_-]{1,31})(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/gu;
  for (const match of (description ?? "").matchAll(pattern)) {
    found.add(match[1]);
    if (found.size === limit) break;
  }
  return [...found];
}

type RegisteredCommand = { name: string; description?: string; description_localizations?: Record<string, string> | null; type?: string };

/** The commands a bot's page lists: its registered ones in the reader's language, else those its description names */
export function listedCommands(
  registered: RegisteredCommand[] | undefined,
  description: string | undefined,
  locale: string,
): { source: "registered"; items: { name: string; description: string }[] } | { source: "description"; items: { name: string; description?: undefined }[] } {
  if (!registered) return { source: "description", items: commandsIn(description).map((name) => ({ name })) };
  const language = locale.split("-")[0];
  return {
    source: "registered",
    items: registered
      .filter((command) => (command.type ?? "ChatInput") === "ChatInput")
      .map((command) => ({
        name: command.name,
        description: command.description_localizations?.[locale] ?? command.description_localizations?.[language] ?? command.description ?? "",
      })),
  };
}

/** A description as plain words, for a card (web plainDescription) */
export function plainDescription(source: string | undefined | null): string {
  if (!source) return "";
  return source
    .replace(/^[ \t]*(```|~~~).*$/gm, "")
    .replace(/\|\|[\s\S]+?\|\|/g, "…")
    .replace(/!\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "")
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}_])(___|__|_)(?=\S)([\s\S]*?\S)\2(?![\p{L}\p{N}_])/gu, "$1$3")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/(`+)([^`]+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only ordinary web addresses become links */
export const safeLink = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);

// bot permissions ----------------------------------------------------------

/** Permissions that let a bot change the server or remove people */
export const SENSITIVE = [2 ** 1, 2 ** 2, 2 ** 3, 2 ** 6, 2 ** 7, 2 ** 37];

/** What the link asks for, else the bot's own default permissions */
export function askedPermissions(invite: { defaultPermissions?: number }, link?: number): number | undefined {
  for (const value of [link, invite.defaultPermissions]) {
    if (value !== undefined && Number.isSafeInteger(value) && value > 0) return value;
  }
  return undefined;
}

/** Whether a permission bit is set; works past 2^31 (no bit operators) */
export const hasBit = (permissions: number, bit: number) => Math.floor(permissions / bit) % 2 === 1;

/** Tick or untick one permission bit */
export const toggleBit = (permissions: number, bit: number) => (hasBit(permissions, bit) ? permissions - bit : permissions + bit);

/** Query of `POST /bots/{id}/invite`: always named for a server (0 = none, not the defaults) */
export const inviteQuery = (isServer: boolean, permissions?: number) => (isServer ? `?permissions=${permissions ?? 0}` : "");

/** Permission groups in the add page, every permission the server has */
export const PERMISSION_GROUPS: { id: "server" | "members" | "messages" | "voice"; bits: number[] }[] = [
  { id: "server", bits: [0, 1, 2, 3, 4, 24, 42, 40].map((bit) => 2 ** bit) },
  { id: "members", bits: [6, 7, 8, 9, 10, 11, 12, 13].map((bit) => 2 ** bit) },
  { id: "messages", bits: [20, 21, 22, 23, 25, 26, 27, 28, 29, 37, 38, 39, 41, 43, 44, 45].map((bit) => 2 ** bit) },
  { id: "voice", bits: [30, 31, 32, 33, 34, 35, 36].map((bit) => 2 ** bit) },
];

/** Every permission a bot asks for, by group; unknown bits under "other" so nothing asked is hidden */
export function askedGroups(asked: number): { id: string; bits: number[] }[] {
  const known = new Set(PERMISSION_GROUPS.flatMap((group) => group.bits));
  const groups: { id: string; bits: number[] }[] = PERMISSION_GROUPS.map((group) => ({ id: group.id, bits: group.bits.filter((bit) => hasBit(asked, bit)) }));
  const other: number[] = [];
  for (let bit = 1, n = 0; n < 53; bit *= 2, n++) {
    if (hasBit(asked, bit) && !known.has(bit)) other.push(bit);
  }
  groups.push({ id: "other", bits: other });
  return groups.filter((group) => group.bits.length);
}

/** The groups the Discover bot page shows (web Detail.tsx), only what is asked */
export function detailGroups(asked: number | undefined): { id: "server" | "members" | "messages" | "voice"; bits: number[] }[] {
  if (asked === undefined) return [];
  const groups: { id: "server" | "members" | "messages" | "voice"; bits: number[] }[] = [
    { id: "server", bits: [2 ** 1, 2 ** 0, 2 ** 2, 2 ** 3, 2 ** 24, 2 ** 20] },
    { id: "members", bits: [2 ** 6, 2 ** 7, 2 ** 8, 2 ** 9, 2 ** 11] },
    { id: "messages", bits: [2 ** 21, 2 ** 22, 2 ** 23, 2 ** 26, 2 ** 27, 2 ** 29, 2 ** 37] },
    { id: "voice", bits: [2 ** 30, 2 ** 31] },
  ];
  return groups.map((group) => ({ ...group, bits: group.bits.filter((bit) => hasBit(asked, bit)) })).filter((group) => group.bits.length);
}

/** When a bot was registered: the time in its ULID */
export function ulidTime(id: string): number | undefined {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) return undefined;
  let time = 0;
  for (const char of id.slice(0, 10).toUpperCase()) time = time * 32 + ALPHABET.indexOf(char);
  return time;
}
