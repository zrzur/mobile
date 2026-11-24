import { forwardOrigin, isolated, originLink } from "../forwarded/origin";
import { canRemove, isCustomEmoji, pickGroup, reactionGroups, reactionPath } from "../reactions/logic";
import { sheetFiles, toSheetFile } from "../rich/sheetFiles";

describe("who reacted", () => {
  const reactions: [string, Set<string>][] = [
    ["👍", new Set(["u1", "me"])],
    ["01HZZZZZZZZZZZZZZZZZZZZZZZ", new Set(["u2"])],
    ["🔥", new Set()],
  ];

  it("keeps reactions with people, in order, and marks yours", () => {
    const groups = reactionGroups(reactions, "me");
    expect(groups.map((g) => g.emoji)).toEqual(["👍", "01HZZZZZZZZZZZZZZZZZZZZZZZ"]);
    expect(groups[0]).toEqual({ emoji: "👍", users: ["u1", "me"], mine: true });
    expect(groups[1].mine).toBe(false);
  });

  it("opens the held reaction, or the first when it is gone", () => {
    const groups = reactionGroups(reactions, "me");
    expect(pickGroup(groups, "01HZZZZZZZZZZZZZZZZZZZZZZZ")?.emoji).toBe("01HZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(pickGroup(groups, "🔥")?.emoji).toBe("👍");
    expect(pickGroup([], "👍")).toBeUndefined();
  });

  it("your own reaction can always go; others' only with Manage messages", () => {
    expect(canRemove("me", "me", false)).toBe(true);
    expect(canRemove("u1", "me", false)).toBe(false);
    expect(canRemove("u1", "me", true)).toBe(true);
  });

  it("tells custom emoji from Unicode", () => {
    expect(isCustomEmoji("01HZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(true);
    expect(isCustomEmoji("👍")).toBe(false);
    expect(reactionPath("c", "m", "👍")).toBe("/channels/c/messages/m/reactions/👍");
  });
});

describe("forwarded copy", () => {
  const channels: Record<string, { id: string; type: string; displayName?: string; server?: { name: string } }> = {
    t: { id: "t", type: "TextChannel", displayName: "general", server: { name: "Gamers" } },
    d: { id: "d", type: "DirectMessage", displayName: "Sami" },
  };
  const lookup = (id: string) => channels[id];

  it("reads the origin from the message", () => {
    expect(forwardOrigin(undefined)).toBeUndefined();
    expect(forwardOrigin({ channel: "t" })).toBeUndefined();
    expect(forwardOrigin({ message: "m", channel: "t", sent_at: "2026-11-01T10:00:00Z", note: "  " })).toEqual({ message: "m", channel: "t", sent_at: "2026-11-01T10:00:00Z", note: null });
    expect(forwardOrigin({ message: "m", note: "look" })?.note).toBe("look");
  });

  it("links back only to a channel the app knows", () => {
    expect(originLink({ message: "m", channel: "t" }, lookup)?.place).toBe("#general · Gamers");
    expect(originLink({ message: "m", channel: "d" }, lookup)?.place).toBe("Sami");
    expect(originLink({ message: "m", channel: "x" }, lookup)).toBeUndefined();
    expect(originLink({ message: "m", channel: null }, lookup)).toBeUndefined();
  });

  it("isolates names and dates inside a sentence", () => {
    expect(isolated("#general")).toBe("⁨#general⁩");
  });
});

describe("message files for the sheet", () => {
  it("uses the original file and the preview to open", () => {
    const file = toSheetFile({ id: "f", filename: "a.png", metadata: { type: "Image" }, originalUrl: "https://cdn/o", previewUrl: "https://cdn/p" });
    expect(file).toEqual({ id: "f", url: "https://cdn/o", previewUrl: "https://cdn/p", name: "a.png", kind: "image" });
  });

  it("skips files without an address and keeps order", () => {
    const files = sheetFiles({
      attachments: [
        { id: "1", filename: "v.mp4", metadata: { type: "Video" }, originalUrl: "u1" },
        { id: "2", filename: "x", metadata: { type: "File" } },
        { id: "3", filename: "s.ogg", metadata: { type: "Audio" }, originalUrl: "u3" },
      ],
    } as never);
    expect(files.map((f) => [f.id, f.kind])).toEqual([
      ["1", "video"],
      ["3", "audio"],
    ]);
  });
});
