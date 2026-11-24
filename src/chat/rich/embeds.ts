/**
 * The web's rules for embeds and link previews, without React: which embeds
 * show, which are GIFs, when the message text hides, who may remove previews,
 * how bot fields group, how big media is drawn, and the click-to-load
 * players (web: `common/lib/gifs.ts`, `channels/text/linkPreviews.ts`,
 * `messaging/elements/{Embed,TextEmbed,SpecialEmbed,embedSettings}`).
 */
import { type OwnLinkOptions, parseOwnLink } from "./ownLink";

/** The parts of an SDK embed these rules read */
export type EmbedLike = {
  type: string;
  url?: string;
  originalUrl?: string;
  image?: unknown;
  video?: unknown;
};

function embedUrl(embed: EmbedLike): URL | undefined {
  const value = embed.type === "Website" ? embed.originalUrl || embed.url : embed.url;
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    return url;
  } catch {
    return;
  }
}

/** Only recognised GIF pages and media are drawn as looping GIFs (no substring host matches) */
export function isGif(embed: EmbedLike): boolean {
  const url = embedUrl(embed);
  if (!url) return false;
  const host = url.hostname.replace(/^www\./, "");
  if (embed.type === "Website") {
    return (
      (host === "giphy.com" && /^\/(gifs|embed)\/[^/]+\/?$/.test(url.pathname)) ||
      (host === "tenor.com" && /^\/view\/[^/]+\/?$/.test(url.pathname)) ||
      (host === "gifbox.me" && /^\/view\/[^/]+\/?$/.test(url.pathname)) ||
      (host === "klipy.com" && /^\/gifs\/[^/]+\/?$/.test(url.pathname))
    );
  }
  return (
    (embed.type === "Image" || embed.type === "Video") &&
    (/^media\d*\.giphy\.com$/.test(host) || host === "i.giphy.com" || host === "media.tenor.com" || host === "static.klipy.com") &&
    /\.(gif|mp4|webm|webp)$/i.test(url.pathname)
  );
}

function sameLink(content: string, url: URL | undefined) {
  try {
    return new URL(content.trim()).href === url?.href;
  } catch {
    return false;
  }
}

/** A message that is nothing but one direct image or video link shows only the media */
export function isOnlyMediaLink(content: string | undefined, embeds: readonly EmbedLike[] | undefined): boolean {
  if (!content || embeds?.length !== 1) return false;
  const embed = embeds[0];
  if (embed.type !== "Image" && embed.type !== "Video") return false;
  const url = embedUrl(embed);
  return !!url && sameLink(content, url);
}

/** A message that is nothing but one GIF link shows only the GIF */
export function isOnlyGifLink(content: string | undefined, embeds: readonly EmbedLike[] | undefined): boolean {
  if (!content || embeds?.length !== 1 || !isGif(embeds[0])) return false;
  if (embeds[0].type === "Website" && !embeds[0].video && !embeds[0].image) return false;
  return sameLink(content, embedUrl(embeds[0]));
}

/** Web Message `isOnlyGIF()`: the message text is not drawn, only its media */
export function hidesContent(content: string | undefined, embeds: readonly EmbedLike[] | undefined): boolean {
  return isOnlyGifLink(content, embeds) || isOnlyMediaLink(content, embeds);
}

/** A website preview of one of our own invite or bot links (the link shows its card instead) */
export function isOwnLinkPreview(embed: EmbedLike, options?: OwnLinkOptions): boolean {
  if (embed.type !== "Website") return false;
  const posted = embed.originalUrl || embed.url;
  return !!posted && !!parseOwnLink(posted, options);
}

/** The embeds a message shows: all but previews of our own links */
export function shownEmbeds<T extends EmbedLike>(embeds: readonly T[] | null | undefined, options?: OwnLinkOptions): T[] {
  return (embeds ?? []).filter((embed) => !isOwnLinkPreview(embed, options));
}

export type PreviewMessage = {
  embeds?: readonly { type: string }[] | null;
  author?: { self?: boolean; official?: boolean } | null;
  channel?: { havePermission(permission: "ManageMessages"): boolean } | null;
};

/** Previews the link check made; a bot's own cards (Text embeds) are part of the message */
export function hasLinkPreviews(message: PreviewMessage): boolean {
  return (message.embeds ?? []).some((embed) => embed.type !== "Text");
}

/** The author removes their own previews; Manage Messages removes anyone's (not official messages) */
export function canRemoveLinkPreviews(message: PreviewMessage): boolean {
  if (!hasLinkPreviews(message) || message.author?.official) return false;
  return !!message.author?.self || !!message.channel?.havePermission("ManageMessages");
}

/** Up to three inline fields share a row; any other field takes a row of its own */
export function fieldRows<F extends { inline?: boolean }>(fields: readonly F[]): F[][] {
  const rows: F[][] = [];
  for (const field of fields) {
    const last = rows[rows.length - 1];
    if (field.inline && last && last[0].inline && last.length < 3) last.push(field);
    else rows.push([field]);
  }
  return rows;
}

const FIRST_STRONG = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-ࣿיִ-﷿ﹰ-﻿]/;
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** One direction for a whole card, from its own words (first strong letter) */
export function cardDirection(parts: (string | undefined | null)[]): "rtl" | "ltr" | undefined {
  const first = FIRST_STRONG.exec(parts.filter(Boolean).join(" "))?.[0];
  if (!first) return undefined;
  return RTL_CHAR.test(first) ? "rtl" : "ltr";
}

/** Descriptions longer than this start folded (about twelve lines) */
export const FOLD_AT = 600;

/** Web `fitMessageMedia`: the whole picture inside the chat, ratio kept, 160×120 at least, 420 at most */
export function fitMessageMedia(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 160, height: 120 };
  }
  const minimumScale = Math.max(1, 160 / width, 120 / height);
  const scale = Math.min(minimumScale, 420 / width, 420 / height);
  return { width: width * scale, height: height * scale };
}

/** The media box on a phone: fitted, then narrowed to the room the message has */
export function mediaBox(width: number, height: number, room: number) {
  const fit = fitMessageMedia(width, height);
  const scale = Math.min(1, room / fit.width);
  return { width: Math.round(fit.width * scale), height: Math.round(fit.height * scale) };
}

// ---- click-to-load players ----

/** Who a player talks to, for the line under the placeholder */
export const PLAYER_PROVIDERS: Record<string, { name: string; company: string } | undefined> = {
  YouTube: { name: "YouTube", company: "Google" },
  Twitch: { name: "Twitch", company: "Twitch (Amazon)" },
  Spotify: { name: "Spotify", company: "Spotify" },
  Soundcloud: { name: "SoundCloud", company: "SoundCloud" },
  Bandcamp: { name: "Bandcamp", company: "Bandcamp" },
  AppleMusic: { name: "Apple Music", company: "Apple" },
  Streamable: { name: "Streamable", company: "Streamable" },
  Player: { name: "", company: "" },
};

const PLAYER_SITE_COMPANIES: Record<string, string> = {
  Vimeo: "Vimeo",
  Dailymotion: "Dailymotion",
  TikTok: "TikTok (ByteDance)",
  Instagram: "Instagram (Meta)",
  Deezer: "Deezer",
  "Apple Podcasts": "Apple",
  Kick: "Kick",
  Mixcloud: "Mixcloud",
  Tidal: "Tidal",
  Loom: "Loom (Atlassian)",
  Bilibili: "Bilibili",
  TED: "TED",
  Coub: "Coub",
  Steam: "Steam (Valve)",
  Facebook: "Facebook (Meta)",
};

/** Whether an embed is one of the click-to-load players (Lightspeed is a normal link) */
export const isPlayerEmbed = (type?: string) => !!type && PLAYER_PROVIDERS[type] !== undefined;

/** A special's fields as the web reads them (the "Player" kind is newer than the SDK typings) */
export type SpecialLike = {
  type: string;
  provider?: string;
  width?: number;
  height?: number;
  track_id?: string | null;
  album_id?: string;
};

/** Consent key: the type, or "Player:<site>" (yes to Vimeo is not yes to TikTok) */
export function playerKey(special?: SpecialLike) {
  if (!special) return undefined;
  return special.type === "Player" ? `Player:${special.provider}` : special.type;
}

export function playerProvider(key: string) {
  if (key.startsWith("Player:")) {
    const name = key.slice("Player:".length);
    return { name, company: PLAYER_SITE_COMPANIES[name] ?? name };
  }
  return PLAYER_PROVIDERS[key];
}

export const FALLBACK_POLICY = "https://zrzur.com/legal/privacy#players";

/** The server's privacy page, pointing at the players section unless it names a section */
export function playersPolicyUrl(serverUrl?: string) {
  if (!serverUrl) return FALLBACK_POLICY;
  return serverUrl.includes("#") ? serverUrl : `${serverUrl}#players`;
}

/** After a press on Load: the player's "don't start" settings turned to "start" */
export function startOnClick(address?: string) {
  if (!address) return address;
  try {
    const url = new URL(address);
    for (const key of ["autoplay", "auto_play", "autostart"]) {
      const value = url.searchParams.get(key);
      if (value === "0") url.searchParams.set(key, "1");
      else if (value === "false") url.searchParams.set(key, "true");
    }
    return url.toString();
  } catch {
    return address;
  }
}

/** The player's natural size (web SpecialEmbed `getSize`) */
export function playerSize(special: SpecialLike, video?: { width: number; height: number }) {
  switch (special.type) {
    case "YouTube":
    case "Bandcamp":
    case "Streamable":
      return { width: video?.width ?? 1280, height: video?.height ?? 720 };
    case "Twitch":
      return { width: 1280, height: 720 };
    case "Spotify":
      return { width: 420, height: 355 };
    case "Soundcloud":
      return { width: 480, height: 460 };
    case "AppleMusic":
      return { width: 450, height: special.track_id ? 175 : 450 };
    case "Player":
      return { width: special.width ?? 0, height: special.height ?? 0 };
    default:
      return { width: 0, height: 0 };
  }
}

/** The SDK has no address for Apple Music, so it is built here */
export function playerUrl(special: SpecialLike | undefined, embedURL: string | undefined) {
  if (special?.type === "AppleMusic" && special.album_id) {
    const url = new URL(`https://embed.music.apple.com/us/album/${encodeURIComponent(special.album_id)}`);
    if (special.track_id) url.searchParams.set("i", special.track_id);
    return url.toString();
  }
  return embedURL;
}

/** Only http(s) pages may open from a card */
export function isOpenableUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * A stable key for a message's embed: list cells are recycled, and an
 * index key let one message's started video carry over to another
 * message's embed (and play with sound).
 */
export function embedKey(messageId: string, embed: { type: string; url?: string | null }, index: number): string {
  return `${messageId}:${index}:${embed.url ?? embed.type}`;
}
