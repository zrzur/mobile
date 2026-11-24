import { channelLink, linkHref, needsAccount, parseDeepLink, pushTarget, systemPath } from "../links";

const S = "01HSERVER0000000000000000A";
const C = "01HCHANNEL000000000000000B";
const M = "01HMESSAGE000000000000000C";
const U = "01HUSER0000000000000000000";

describe("parseDeepLink", () => {
  it("reads invites in every form", () => {
    for (const url of [
      "https://zrzur.cc/Dm8w7T5p",
      "https://www.zrzur.cc/Dm8w7T5p/",
      "https://zrzur.cc/invite/Dm8w7T5p",
      "https://app.zrzur.com/invite/Dm8w7T5p",
      "zrzur://invite/Dm8w7T5p",
      "zrzur:///invite/Dm8w7T5p",
    ]) {
      expect(parseDeepLink(url)).toEqual({ kind: "invite", code: "Dm8w7T5p" });
    }
    expect(parseDeepLink("https://zrzur.cc/my-server")).toEqual({ kind: "invite", code: "my-server" });
  });

  it("refuses codes that could change the request path", () => {
    expect(parseDeepLink("https://zrzur.cc/..%2Fusers")).toBeUndefined();
    expect(parseDeepLink("https://app.zrzur.com/invite/a%2Fb")).toBeUndefined();
  });

  it("reads channels and messages", () => {
    expect(parseDeepLink(`https://app.zrzur.com/server/${S}/channel/${C}/${M}`)).toEqual({ kind: "channel", serverId: S, channelId: C, messageId: M });
    expect(parseDeepLink(`https://app.zrzur.com/channel/${C}`)).toEqual({ kind: "channel", channelId: C });
    expect(parseDeepLink(`zrzur://channel/${C}/${M}`)).toEqual({ kind: "channel", channelId: C, messageId: M });
  });

  it("reads servers, profiles and bots", () => {
    expect(parseDeepLink(`https://app.zrzur.com/server/${S}/lobby`)).toEqual({ kind: "server", serverId: S });
    expect(parseDeepLink(`https://app.zrzur.com/friends?profile=${U}`)).toEqual({ kind: "user", userId: U });
    expect(parseDeepLink(`zrzur://user/${U}`)).toEqual({ kind: "user", userId: U });
    expect(parseDeepLink(`https://zrzur.cc/b/${U}?permissions=8`)).toEqual({ kind: "bot", id: U, permissions: 8 });
  });

  it("keeps the sign-up and password links", () => {
    expect(parseDeepLink("https://app.zrzur.com/login/verify/abc_1-2")).toEqual({ kind: "verify", code: "abc_1-2" });
    expect(parseDeepLink("zrzur://reset/tok")).toEqual({ kind: "reset", token: "tok" });
  });

  it("ignores other sites and schemes", () => {
    expect(parseDeepLink("https://example.com/invite/abc")).toBeUndefined();
    expect(parseDeepLink("exp+zrzur://expo-development-client/?url=x")).toBeUndefined();
    expect(parseDeepLink("https://app.zrzur.com/unknown/page")).toBeUndefined();
  });
});

describe("linkHref and systemPath", () => {
  it("opens this app's screens", () => {
    expect(linkHref({ kind: "invite", code: "abc" })).toBe("/invite-preview/abc");
    expect(linkHref({ kind: "channel", channelId: C, messageId: M })).toBe(`/channel/${C}?message=${M}`);
    expect(linkHref({ kind: "server", serverId: S })).toBe(`/server/${S}`);
    expect(linkHref({ kind: "user", userId: U })).toBe(`/friends?profile=${U}`);
    expect(linkHref({ kind: "bot", id: U })).toBe(`/bot/${U}`);
    expect(linkHref({ kind: "bot", id: U, permissions: 8 })).toBe(`/bot/${U}?permissions=8`);
    expect(linkHref({ kind: "event", path: "summer-meetup" })).toBe("/e/summer-meetup");
    expect(linkHref({ kind: "event", path: "join/Ab12" })).toBe("/e/join/Ab12");
    expect(linkHref({ kind: "discover", slug: "my-server" })).toBe("/discover/my-server");
    expect(linkHref({ kind: "delete", token: "t1" })).toBe("/delete/t1");
    expect(linkHref({ kind: "confirm-change", token: "t2" })).toBe("/confirm-change/t2");
  });

  it("reads account links that work signed out", () => {
    expect(parseDeepLink("https://app.zrzur.com/login/delete/tok_1")).toEqual({ kind: "delete", token: "tok_1" });
    expect(parseDeepLink("https://app.zrzur.com/login/confirm-change/tok-2")).toEqual({ kind: "confirm-change", token: "tok-2" });
    expect(parseDeepLink("zrzur://delete/a%2Fb")).toBeUndefined();
    expect(needsAccount({ kind: "delete", token: "x" })).toBe(false);
    expect(needsAccount({ kind: "confirm-change", token: "x" })).toBe(false);
    expect(needsAccount({ kind: "bot", id: U })).toBe(true);
  });

  it("reads Discover pages", () => {
    expect(parseDeepLink("https://app.zrzur.com/discover/my-server")).toEqual({ kind: "discover", slug: "my-server" });
    expect(parseDeepLink(`https://app.zrzur.com/discover/servers/${S}`)).toEqual({ kind: "discover", slug: S });
    expect(parseDeepLink(`https://app.zrzur.com/discover/bots/${U}`)).toEqual({ kind: "bot", id: U });
    expect(parseDeepLink("https://app.zrzur.com/discover/gaming")).toEqual({ kind: "page", page: "discover" });
    expect(parseDeepLink("https://app.zrzur.com/discover/ar")).toEqual({ kind: "page", page: "discover" });
    expect(parseDeepLink("https://app.zrzur.com/discover")).toEqual({ kind: "page", page: "discover" });
  });

  it("rewrites system links and leaves in-app paths alone", () => {
    expect(systemPath("https://zrzur.cc/abc")).toBe("/invite-preview/abc");
    expect(systemPath("/invite/abc")).toBe("/invite-preview/abc");
    expect(systemPath(`/channel/${C}/${M}`)).toBe(`/channel/${C}?message=${M}`);
    expect(systemPath(`/channel/${C}?message=${M}`)).toBe(`/channel/${C}?message=${M}`);
    expect(systemPath(`https://zrzur.cc/b/${U}`)).toBe(`/bot/${U}`);
    expect(systemPath("https://app.zrzur.com/e/join/Ab12")).toBe("/e/join/Ab12");
    expect(systemPath("https://app.zrzur.com/login/delete/t1")).toBe("/delete/t1");
    expect(systemPath("/")).toBe("/");
    expect(systemPath("zrzur://verify/x1")).toBe("/verify/x1");
    expect(systemPath("/friends?add=1")).toBe("/friends?add=1");
    expect(systemPath("/login/reset/t")).toBe("/reset/t");
    expect(systemPath("https://example.com/x")).toBe("https://example.com/x");
  });

  it("copies channel links like the web", () => {
    expect(channelLink(C, S)).toBe(`https://app.zrzur.com/server/${S}/channel/${C}`);
    expect(channelLink(C)).toBe(`https://app.zrzur.com/channel/${C}`);
  });
});

describe("pushTarget", () => {
  it("reads this app's own notifications", () => {
    expect(pushTarget({ href: `/channel/${C}`, channelId: C })).toEqual({ href: `/channel/${C}`, channelId: C });
  });

  it("reads Apple pushes from pushd (url + message)", () => {
    expect(pushTarget({ url: `https://app.zrzur.com/channel/${C}/${M}`, message: { _id: M, channel: C } })).toEqual({
      href: `/channel/${C}?message=${M}`,
      channelId: C,
    });
    expect(pushTarget({ url: `https://app.zrzur.com/friends?profile=${U}` })).toEqual({ href: `/friends?profile=${U}`, channelId: undefined });
  });

  it("reads Firebase data from pushd", () => {
    expect(pushTarget({ type: "push.message", message: M, channel: C })).toEqual({ href: `/channel/${C}?message=${M}`, channelId: C });
    expect(pushTarget({ type: "push.fr.received", id: U, username: "sam" })).toEqual({ href: `/friends?profile=${U}` });
    expect(pushTarget({ type: "push.dm.call", channel_id: C })).toEqual({ href: `/channel/${C}`, channelId: C });
  });

  it("refuses an outside href and empty data", () => {
    expect(pushTarget({ href: "https://evil.example" })).toBeUndefined();
    expect(pushTarget(null)).toBeUndefined();
  });
});
