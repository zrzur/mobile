import {
  DEFAULT_GIF_URL,
  type KlipyGif,
  balanceColumns,
  gifEndpoint,
  gifLocale,
  klipyGifs,
  mediaSrc,
  mergePages,
  previewOf,
  resolveGifUrl,
  sendUrlOf,
  unwrap,
} from "../gifs";

const gif = (id: number, w = 100, h = 100): KlipyGif => ({
  id,
  slug: `g${id}`,
  file: {
    sm: {
      webp: { url: `https://k/${id}.webp`, src: `/m/${id}.webp`, width: w, height: h },
      jpg: { url: "", src: `/m/${id}.jpg`, width: w, height: h },
    },
    md: { gif: { url: `https://klipy.com/gifs/g${id}`, width: w, height: h } },
  },
});

describe("GIF service", () => {
  it("only lets development builds point elsewhere", () => {
    expect(resolveGifUrl("http://10.0.2.2:14706/", true)).toBe("http://10.0.2.2:14706");
    expect(resolveGifUrl("http://10.0.2.2:14706", false)).toBe(DEFAULT_GIF_URL);
    expect(resolveGifUrl("ftp://x", true)).toBe(DEFAULT_GIF_URL);
  });
  it("builds the web's endpoints and reads the envelope", () => {
    expect(gifEndpoint("https://gif.zrzur.com/", "gifs", { query: "a b", page: 2 })).toBe("https://gif.zrzur.com/klipy/gifs?query=a+b&page=2");
    expect(unwrap({ result: true, data: 5 })).toBe(5);
    expect(() => unwrap({ result: false })).toThrow();
    expect(gifLocale("zh-Hans")).toBe("zh");
  });
  it("sends the session token to our service only", async () => {
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ data: { data: [], current_page: 1, has_next: false } }) }));
    await klipyGifs("https://gif.zrzur.com", { query: "", page: 1, locale: "en" }, "tok", undefined, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gif.zrzur.com/klipy/gifs?query=&page=1&per_page=24&locale=en");
    expect(init).toMatchObject({ credentials: "omit", headers: { "X-Session-Token": "tok" } });
  });
  it("loads only signed links and sends the KLIPY address", () => {
    expect(mediaSrc("https://gif.zrzur.com", previewOf(gif(1)))).toBe("https://gif.zrzur.com/m/1.webp");
    expect(mediaSrc("https://gif.zrzur.com", { src: undefined })).toBeUndefined();
    expect(sendUrlOf(gif(1))).toBe("https://klipy.com/gifs/g1");
  });
  it("balances two columns and drops repeats across pages", () => {
    const [a, b] = balanceColumns([gif(1, 100, 300), gif(2), gif(3), gif(4)]);
    expect(a.map((g) => g.id)).toEqual([1]);
    expect(b.map((g) => g.id)).toEqual([2, 3, 4]);
    const merged = mergePages([
      { data: [gif(1), gif(2)], current_page: 1, has_next: true },
      { data: [gif(2), gif(3)], current_page: 2, has_next: false },
    ]);
    expect(merged.map((g) => g.id)).toEqual([1, 2, 3]);
  });
});
