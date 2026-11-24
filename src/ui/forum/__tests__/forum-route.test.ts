import { ulid } from "ulid";

import { canSubmitThread, toggleTag, validTagEmoji } from "../tags";
import { channelRoute } from "../channelRoute";
import { decodeTime } from "../posts";
import { closeStartThread, newHostToken, registerHost, startThread, startThreadRequest, subscribeStartThread, threadNameFrom, topHost } from "../../threads/startThread";

describe("channelRoute", () => {
  it("opens a forum's post list", () => {
    expect(channelRoute({ id: "F", isForum: true })).toEqual({ pathname: "/forum/[id]", params: { id: "F" } });
  });
  it("opens a thread or post as its own chat", () => {
    expect(channelRoute({ id: "T", isThread: true })).toEqual({ pathname: "/thread/[id]", params: { id: "T" } });
  });
  it("opens anything else in the chat screen, with a message to jump to", () => {
    expect(channelRoute({ id: "C" })).toEqual({ pathname: "/channel/[id]", params: { id: "C" } });
    expect(channelRoute({ id: "C" }, "M")).toEqual({ pathname: "/channel/[id]", params: { id: "C", message: "M" } });
  });
});

describe("forum tags and the new-post form", () => {
  it("accepts custom emoji ids and short Unicode emoji, not words", () => {
    expect(validTagEmoji("01HAAAAAAAAAAAAAAAAAAAAAAA")).toBe("01HAAAAAAAAAAAAAAAAAAAAAAA");
    expect(validTagEmoji("🐛")).toBe("🐛");
    expect(validTagEmoji("csc")).toBeUndefined();
    expect(validTagEmoji(null)).toBeUndefined();
  });
  it("switches a tag on and off", () => {
    expect(toggleTag(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTag(["a", "b"], "a")).toEqual(["b"]);
  });
  it("needs a name; a forum post also needs text and, when required, a tag", () => {
    expect(canSubmitThread({ name: " ", content: "", tags: [] })).toBe(false);
    expect(canSubmitThread({ name: "Help", content: "", tags: [] })).toBe(true);
    expect(canSubmitThread({ name: "Help", content: "", tags: [] }, { requireTag: false })).toBe(false);
    expect(canSubmitThread({ name: "Help", content: "x", tags: [] }, { requireTag: true })).toBe(false);
    expect(canSubmitThread({ name: "Help", content: "x", tags: ["t"] }, { requireTag: true })).toBe(true);
    expect(canSubmitThread({ name: "x".repeat(101), content: "", tags: [] })).toBe(false);
  });
  it("reads the time of a ULID", () => {
    expect(decodeTime(ulid(1_700_000_000_000))).toBe(1_700_000_000_000);
    expect(decodeTime("not-an-id!")).toBe(0);
  });
});

describe("startThread", () => {
  afterEach(closeStartThread);

  it("names a thread after the message's first words, 60 characters at most", () => {
    expect(threadNameFrom("  hello\n  world ")).toBe("hello world");
    expect(threadNameFrom("a".repeat(70))).toBe(`${"a".repeat(60)}…`);
    expect(threadNameFrom(undefined)).toBe("");
  });

  it("hands the request to listeners and clears it", () => {
    const seen: (string | undefined)[] = [];
    const stop = subscribeStartThread(() => seen.push(startThreadRequest()?.messageId));
    startThread("C", "M", "name");
    expect(startThreadRequest()).toEqual({ channelId: "C", messageId: "M", name: "name" });
    closeStartThread();
    expect(startThreadRequest()).toBeNull();
    stop();
    expect(seen).toEqual(["M", undefined]);
  });

  it("lets only the host mounted last draw the sheet for a channel", () => {
    const below = newHostToken();
    const top = newHostToken();
    const releaseBelow = registerHost(below, "C");
    const releaseTop = registerHost(top, "C");
    expect(topHost("C")).toBe(top);
    releaseTop();
    expect(topHost("C")).toBe(below);
    releaseBelow();
    expect(topHost("C")).toBe(0);
  });
});
