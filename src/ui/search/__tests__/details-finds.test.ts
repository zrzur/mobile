import { detailsTabs, pickTab } from "../detailsTabs";
import { findFiles, findLinks, findsHas, host, mergeNewest } from "../finds";
import { groupByChannel, resultRows } from "../searchChoices";

describe("channel details tabs (web: ChannelDetailsPhone)", () => {
  it("a server text channel has every tab, members first", () => {
    expect(detailsTabs({ type: "TextChannel" })).toEqual(["members", "media", "pins", "threads", "links", "files"]);
  });
  it("direct messages and saved notes have no members tab", () => {
    expect(detailsTabs({ type: "DirectMessage" })).toEqual(["media", "pins", "links", "files"]);
    expect(detailsTabs({ type: "SavedMessages" })).toEqual(["media", "pins", "links", "files"]);
  });
  it("threads, forums, voice channels and groups have no threads tab", () => {
    for (const c of [{ type: "TextChannel", isThread: true }, { type: "TextChannel", isForum: true }, { type: "TextChannel", isVoice: true }, { type: "Group" }])
      expect(detailsTabs(c)).not.toContain("threads");
  });
  it("picks the asked tab when the channel has it, else the first", () => {
    const tabs = detailsTabs({ type: "DirectMessage" });
    expect(pickTab(tabs, "pins")).toBe("pins");
    expect(pickTab(tabs, "members")).toBe("media");
    expect(pickTab(tabs, undefined)).toBe("media");
  });
});

describe("media, links and files", () => {
  const img = { id: "f1", metadata: { type: "Image" } };
  const vid = { id: "f2", metadata: { type: "Video" } };
  const doc = { id: "f3", metadata: { type: "File" } };
  const a = { id: "01B", attachments: [img, doc] };
  const b = { id: "01C", attachments: [vid] };

  it("asks for image and video for media, one kind otherwise", () => {
    expect(findsHas("media")).toEqual(["image", "video"]);
    expect(findsHas("links")).toEqual(["link"]);
    expect(findsHas("files")).toEqual(["file"]);
  });
  it("merges answers: no message twice, newest first", () => {
    expect(mergeNewest([[a], [b, a]]).map((m) => m.id)).toEqual(["01C", "01B"]);
  });
  it("splits pictures from other files", () => {
    expect(findFiles([a, b], true).map((x) => x.file.id)).toEqual(["f1", "f2"]);
    expect(findFiles([a, b], false).map((x) => x.file.id)).toEqual(["f3"]);
  });
  it("uses link previews, else the addresses in the text, once each", () => {
    const withPreview = { id: "1", content: "see https://a.com", embeds: [{ type: "Website", url: "https://www.site.org/x", title: "Site", image: { proxiedURL: "p" } }, { type: "Image" }] };
    const bare = { id: "2", content: "https://x.dev/a and https://x.dev/a and (https://y.io)" };
    const links = findLinks([withPreview, bare]);
    expect(links.map((l) => l.url)).toEqual(["https://www.site.org/x", "https://x.dev/a", "https://y.io"]);
    expect(links[0]).toMatchObject({ title: "Site", image: "p" });
  });
  it("shows the site without www", () => {
    expect(host("https://www.example.com/path?q=1")).toBe("example.com");
    expect(host("not a url")).toBe("not a url");
  });
});

describe("search results", () => {
  const msgs = [
    { id: "3", channelId: "B" },
    { id: "2", channelId: "A" },
    { id: "1", channelId: "B" },
  ];
  it("groups by channel, first seen first, keeping the order inside", () => {
    expect(groupByChannel(msgs)).toEqual([
      { channelId: "B", messages: [msgs[0], msgs[2]] },
      { channelId: "A", messages: [msgs[1]] },
    ]);
  });
  it("puts a channel title before each group only when the whole server was searched", () => {
    expect(resultRows(msgs, true).map((r) => r.kind)).toEqual(["channel", "message", "message", "channel", "message"]);
    expect(resultRows(msgs, false).map((r) => r.kind)).toEqual(["message", "message", "message"]);
  });
});
