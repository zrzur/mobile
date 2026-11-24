/**
 * Media, links and files of a channel (web: ChannelDetailsPhone `Finds`):
 * the channel's own search with a "has" filter, newest first.
 */
export type FindsKind = "media" | "links" | "files";

/** The `has` values asked for, one request each (some servers take one at a time) */
export function findsHas(kind: FindsKind): ("image" | "video" | "link" | "file")[] {
  return kind === "media" ? ["image", "video"] : kind === "links" ? ["link"] : ["file"];
}

type FileLike = { id: string; metadata?: { type?: string } };
type EmbedLike = { type?: string; url?: string; title?: string; siteName?: string; image?: { proxiedURL?: string; url?: string } };
type MessageLike<F extends FileLike = FileLike> = { id: string; content?: string; attachments?: F[]; embeds?: unknown[] };

/** Several answers as one list: no message twice, newest (largest id) first */
export function mergeNewest<T extends { id: string }>(lists: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((m) => !seen.has(m.id) && (seen.add(m.id), true))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export const isPicture = (file: FileLike) => file.metadata?.type === "Image" || file.metadata?.type === "Video";

/** Pictures and videos, or the other files, each with its message */
export function findFiles<F extends FileLike, M extends MessageLike<F>>(messages: readonly M[], pictures: boolean): { message: M; file: F }[] {
  return messages.flatMap((message) => (message.attachments ?? []).filter((file) => isPicture(file) === pictures).map((file) => ({ message, file })));
}

export type LinkFind<M> = { message: M; url: string; title?: string; siteName?: string; image?: string };

/** Link previews of the messages; a link whose site gave no preview is still a link: its address */
export function findLinks<M extends MessageLike>(messages: readonly M[]): LinkFind<M>[] {
  return messages.flatMap((message) => {
    const previews = ((message.embeds ?? []) as EmbedLike[])
      .filter((embed) => embed.type === "Website" && !!embed.url)
      .map((embed) => ({ message, url: embed.url!, title: embed.title, siteName: embed.siteName, image: embed.image?.proxiedURL ?? embed.image?.url }));
    if (previews.length) return previews;
    const seen = new Set<string>();
    return (message.content?.match(/https?:\/\/[^\s<>()]+/g) ?? []).filter((url) => !seen.has(url) && (seen.add(url), true)).map((url) => ({ message, url }));
  });
}

/** The site of an address, without "www." */
export function host(url?: string) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url ?? "");
  return match ? match[1].replace(/^www\./, "") : (url ?? "");
}
