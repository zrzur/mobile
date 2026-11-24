/**
 * GIF client for the picker, the web's `composition/picker/klipy.ts`. The
 * phone talks only to Zrzur's own GIF service (gifbox, gif.zrzur.com): it
 * holds the KLIPY key, searches KLIPY for us and serves the media files, so
 * KLIPY never sees a reader's IP address. The session token only proves to
 * our service who is asking; it is never passed on.
 */

/** Zrzur's GIF service; a development build may point at a local one */
export const DEFAULT_GIF_URL = "https://gif.zrzur.com";

export function resolveGifUrl(override: string | undefined, dev: boolean): string {
  if (!dev || !override) return DEFAULT_GIF_URL;
  try {
    const url = new URL(override);
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_GIF_URL;
    return override.replace(/\/+$/, "");
  } catch {
    return DEFAULT_GIF_URL;
  }
}

export const GIF_URL = resolveGifUrl(process.env.EXPO_PUBLIC_ZRZUR_GIF, typeof __DEV__ !== "undefined" && __DEV__);

type Media = { url: string; src?: string; width: number; height: number };
type Formats = Partial<Record<"gif" | "webp" | "jpg" | "mp4", Media>>;

export type KlipyGif = {
  id: number | string;
  slug: string;
  title?: string;
  file: Partial<Record<"hd" | "md" | "sm" | "xs", Formats>>;
};

export type KlipyCategory = { category: string; query: string; preview_url: string; preview_src?: string };

export type KlipyPage = { data: KlipyGif[]; current_page: number; has_next: boolean };

export const PER_PAGE = 24;

export function gifEndpoint(base: string, path: "categories" | "gifs", params: Record<string, string | number>) {
  const url = new URL(`${base.replace(/\/+$/, "")}/klipy/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

/** Read the service's `{ result, data }` envelope */
export function unwrap<T>(body: unknown): T {
  const value = body as { result?: boolean; data?: T } | null;
  if (!value || value.result === false) throw new Error("GIF service error");
  return value.data as T;
}

async function get<T>(url: string, token: string | undefined, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(url, {
    signal,
    credentials: "omit",
    headers: token ? { "X-Session-Token": token } : undefined,
  });
  if (!response.ok) throw new Error(`GIF service ${response.status}`);
  return unwrap<T>(await response.json());
}

export function klipyCategories(base: string, locale: string, token?: string, signal?: AbortSignal, fetcher?: typeof fetch) {
  return get<{ categories?: KlipyCategory[] }>(gifEndpoint(base, "categories", { locale }), token, signal, fetcher).then((data) => data?.categories ?? []);
}

/** Trending when `query` is empty */
export function klipyGifs(base: string, options: { query: string; page: number; locale: string }, token?: string, signal?: AbortSignal, fetcher?: typeof fetch) {
  return get<KlipyPage>(
    gifEndpoint(base, "gifs", { query: options.query, page: options.page, per_page: PER_PAGE, locale: options.locale }),
    token,
    signal,
    fetcher,
  );
}

/** What the phone may load: only the signed link on our GIF service */
export function mediaSrc(base: string, media?: { src?: string }) {
  return media?.src ? `${base.replace(/\/+$/, "")}${media.src}` : undefined;
}

/** Small animated preview for the grid */
export const previewOf = (gif: KlipyGif) => gif.file.sm?.webp ?? gif.file.sm?.gif ?? gif.file.xs?.gif ?? gif.file.md?.gif;
/** Still frame shown at once (a few KB) */
export const stillOf = (gif: KlipyGif) => gif.file.sm?.jpg;
/** What gets sent: a medium GIF that embeds well in chat */
export const sendUrlOf = (gif: KlipyGif) => (gif.file.md?.gif ?? gif.file.hd?.gif ?? gif.file.sm?.gif)?.url;

/** Two columns, each GIF to the shorter one, so the order reads naturally */
export function balanceColumns(gifs: readonly KlipyGif[]): [KlipyGif[], KlipyGif[]] {
  const cols: [KlipyGif[], KlipyGif[]] = [[], []];
  const heights = [0, 0];
  for (const gif of gifs) {
    const media = previewOf(gif);
    if (!media) continue;
    const side = heights[0] <= heights[1] ? 0 : 1;
    cols[side].push(gif);
    heights[side] += media.height / Math.max(1, media.width);
  }
  return cols;
}

/** Pages joined, the same GIF never twice */
export function mergePages(pages: readonly KlipyPage[]): KlipyGif[] {
  const seen = new Set<string>();
  const out: KlipyGif[] = [];
  for (const page of pages) {
    for (const gif of page.data ?? []) {
      const key = String(gif.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(gif);
    }
  }
  return out;
}

/** The two-letter language the service takes */
export const gifLocale = (locale: string) => locale.split(/[-_]/)[0] || "en";
