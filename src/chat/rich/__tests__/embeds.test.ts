import {
  canRemoveLinkPreviews,
  cardDirection,
  embedKey,
  fieldRows,
  fitMessageMedia,
  hidesContent,
  isGif,
  isOnlyGifLink,
  isOnlyMediaLink,
  isOpenableUrl,
  isPlayerEmbed,
  mediaBox,
  playerKey,
  playerProvider,
  playerSize,
  playerUrl,
  playersPolicyUrl,
  shownEmbeds,
  startOnClick,
} from "../embeds";

describe("isGif", () => {
  it("knows GIF pages and media hosts", () => {
    expect(isGif({ type: "Website", url: "https://tenor.com/view/cat-123" })).toBe(true);
    expect(isGif({ type: "Website", originalUrl: "https://klipy.com/gifs/dance-1", url: "https://x.test" })).toBe(true);
    expect(isGif({ type: "Image", url: "https://media.tenor.com/abc/cat.gif" })).toBe(true);
    expect(isGif({ type: "Video", url: "https://media2.giphy.com/a/b.mp4" })).toBe(true);
  });
  it("refuses lookalikes, http and other paths", () => {
    expect(isGif({ type: "Website", url: "https://tenor.com.evil.test/view/cat" })).toBe(false);
    expect(isGif({ type: "Website", url: "http://tenor.com/view/cat" })).toBe(false);
    expect(isGif({ type: "Website", url: "https://tenor.com/search/cat" })).toBe(false);
    expect(isGif({ type: "Image", url: "https://media.tenor.com/abc/cat.png" })).toBe(false);
  });
});

describe("message text hiding", () => {
  const gif = { type: "Website", url: "https://tenor.com/view/cat-123", image: {} };
  it("hides a lone GIF link and a lone media link", () => {
    expect(isOnlyGifLink("https://tenor.com/view/cat-123", [gif])).toBe(true);
    expect(isOnlyMediaLink(" https://cdn.test/a.png ", [{ type: "Image", url: "https://cdn.test/a.png" }])).toBe(true);
    expect(hidesContent("https://tenor.com/view/cat-123", [gif])).toBe(true);
  });
  it("keeps text around the link and GIF pages without media", () => {
    expect(isOnlyGifLink("look https://tenor.com/view/cat-123", [gif])).toBe(false);
    expect(isOnlyGifLink("https://tenor.com/view/cat-123", [{ type: "Website", url: "https://tenor.com/view/cat-123" }])).toBe(false);
    expect(hidesContent("hello", [])).toBe(false);
  });
});

describe("link previews", () => {
  it("leaves out previews of our own invite and bot links", () => {
    const list = [
      { type: "Website", url: "https://zrzur.cc/abc" },
      { type: "Website", url: "https://example.com/" },
      { type: "Text", url: "https://zrzur.cc/abc" },
    ];
    expect(shownEmbeds(list).map((e) => e.url)).toEqual(["https://example.com/", "https://zrzur.cc/abc"]);
  });
  it("lets the author and moderators remove previews, never on official messages", () => {
    const channel = (manage: boolean) => ({ havePermission: () => manage });
    const previews = [{ type: "Website" }];
    expect(canRemoveLinkPreviews({ embeds: previews, author: { self: true }, channel: channel(false) })).toBe(true);
    expect(canRemoveLinkPreviews({ embeds: previews, author: { self: false }, channel: channel(true) })).toBe(true);
    expect(canRemoveLinkPreviews({ embeds: previews, author: { self: false }, channel: channel(false) })).toBe(false);
    expect(canRemoveLinkPreviews({ embeds: previews, author: { self: true, official: true }, channel: channel(true) })).toBe(false);
    expect(canRemoveLinkPreviews({ embeds: [{ type: "Text" }], author: { self: true }, channel: channel(true) })).toBe(false);
  });
});

describe("cards", () => {
  it("groups up to three inline fields per row", () => {
    const f = (inline: boolean) => ({ name: "n", value: "v", inline });
    expect(fieldRows([f(true), f(true), f(true), f(true), f(false), f(true)]).map((r) => r.length)).toEqual([3, 1, 1, 1]);
  });
  it("takes the card's direction from its first strong letter", () => {
    expect(cardDirection(["123", "مرحبا hello"])).toBe("rtl");
    expect(cardDirection([undefined, "Hello مرحبا"])).toBe("ltr");
    expect(cardDirection(["123 !!"])).toBeUndefined();
  });
});

describe("media sizes", () => {
  it("fits like the web, 160x120 at least, 420 at most", () => {
    expect(fitMessageMedia(0, 0)).toEqual({ width: 160, height: 120 });
    expect(fitMessageMedia(1280, 720)).toEqual({ width: 420, height: 236.25 });
    expect(fitMessageMedia(40, 40)).toEqual({ width: 160, height: 160 });
  });
  it("narrows to the room the message has", () => {
    expect(mediaBox(1280, 720, 300)).toEqual({ width: 300, height: 169 });
  });
});

describe("players", () => {
  it("knows the click-to-load providers and their consent keys", () => {
    expect(isPlayerEmbed("YouTube")).toBe(true);
    expect(isPlayerEmbed("Lightspeed")).toBe(false);
    expect(playerKey({ type: "Player", provider: "Vimeo" })).toBe("Player:Vimeo");
    expect(playerProvider("Player:TikTok")).toEqual({ name: "TikTok", company: "TikTok (ByteDance)" });
    expect(playerProvider("Twitch")?.company).toBe("Twitch (Amazon)");
  });
  it("sizes players and builds Apple Music addresses", () => {
    expect(playerSize({ type: "Spotify" })).toEqual({ width: 420, height: 355 });
    expect(playerSize({ type: "AppleMusic", track_id: "1" })).toEqual({ width: 450, height: 175 });
    expect(playerUrl({ type: "AppleMusic", album_id: "a b", track_id: "7" }, undefined)).toBe("https://embed.music.apple.com/us/album/a%20b?i=7");
  });
  it("turns autoplay on only after a press, and finds the policy page", () => {
    expect(startOnClick("https://www.youtube.com/embed/x?autoplay=0")).toBe("https://www.youtube.com/embed/x?autoplay=1");
    expect(startOnClick("https://p.test/?auto_play=false")).toBe("https://p.test/?auto_play=true");
    expect(playersPolicyUrl()).toBe("https://zrzur.com/legal/privacy#players");
    expect(playersPolicyUrl("https://x.test/privacy")).toBe("https://x.test/privacy#players");
    expect(playersPolicyUrl("https://x.test/privacy#a")).toBe("https://x.test/privacy#a");
  });
  it("opens only web addresses", () => {
    expect(isOpenableUrl("https://a.test")).toBe(true);
    expect(isOpenableUrl("javascript:alert(1)")).toBe(false);
    expect(isOpenableUrl(undefined)).toBe(false);
  });
});

describe("embed keys", () => {
  it("differ between messages and between links, so a recycled cell remounts", () => {
    expect(embedKey("M1", { type: "Video", url: "https://a/v.mp4" }, 0)).not.toBe(embedKey("M2", { type: "Video", url: "https://a/v.mp4" }, 0));
    expect(embedKey("M1", { type: "Video", url: "https://a/v.mp4" }, 0)).not.toBe(embedKey("M1", { type: "Video", url: "https://b/v.mp4" }, 0));
    expect(embedKey("M1", { type: "Text" }, 1)).toBe("M1:1:Text");
  });
});
