import { storedTags, tagEmojiOf, tagsBody, tagsDirty, tagsValid, newTagId, MAX_NAME } from "../channel/forumTagsLogic";
import { base64ToUrl, base64url, codeFrom, linesOf, purgeDate, resolveAssistant, tabsOf } from "../server/assistantLogic";
import { draftOf, MAX_ROLES, newTypeId, sameDraft, ticketsBody, toggleRole, typesReady } from "../server/ticketsLogic";

const BOT = "01HZZZZZZZZZZZZZZZZZZZZZZZ";

describe("tickets settings", () => {
  it("starts a draft from the stored settings, with empty values for what is missing", () => {
    expect(draftOf(undefined)).toEqual({ category: "", staff_roles: [], message: "", label: "", types: [] });
    expect(draftOf({ enabled: true, category: "c1", staff_roles: ["r1"], types: [{ id: "a", name: "Help", staff_roles: null }] })).toEqual({
      category: "c1",
      staff_roles: ["r1"],
      message: "",
      label: "",
      types: [{ id: "a", name: "Help", staff_roles: [] }],
    });
  });
  it("knows when the draft changed", () => {
    const stored = draftOf({ label: "Ask us" });
    expect(sameDraft(stored, draftOf({ label: "Ask us" }))).toBe(true);
    expect(sameDraft(stored, { ...stored, label: "Ask" })).toBe(false);
  });
  it("needs a name on every kind before saving", () => {
    expect(typesReady(draftOf({ types: [{ id: "a", name: "  " }] }))).toBe(false);
    expect(typesReady(draftOf({ types: [{ id: "a", name: "Help" }] }))).toBe(true);
  });
  it("adds and removes roles, at most ten", () => {
    expect(toggleRole(["a"], "a")).toEqual([]);
    expect(toggleRole(["a"], "b")).toEqual(["a", "b"]);
    const full = Array.from({ length: MAX_ROLES }, (_, i) => `r${i}`);
    expect(toggleRole(full, "x")).toBe(full);
  });
  it("makes unique kind ids", () => {
    expect(newTypeId(1, 0.5)).not.toBe(newTypeId(2, 0.5));
  });
  it("sends trimmed text and leaves empty values out", () => {
    expect(ticketsBody(true, { category: "", staff_roles: ["r"], message: "  ", label: " Help ", types: [{ id: "a", name: " Billing ", staff_roles: [] }] })).toEqual({
      enabled: true,
      category: undefined,
      staff_roles: ["r"],
      message: undefined,
      label: "Help",
      types: [{ id: "a", name: "Billing", staff_roles: [] }],
    });
  });
});

describe("forum tags", () => {
  it("drops stored emoji the server would refuse", () => {
    expect(storedTags([{ id: "1", name: "Bug", emoji: "csc" }, { id: "2", name: "Idea", emoji: "💡" }])).toEqual([
      { id: "1", name: "Bug" },
      { id: "2", name: "Idea", emoji: "💡" },
    ]);
    expect(storedTags(undefined)).toEqual([]);
  });
  it("checks names and changes", () => {
    const stored = [{ id: "1", name: "Bug" }];
    expect(tagsDirty(stored, stored, false, false)).toBe(false);
    expect(tagsDirty([{ id: "1", name: "Bugs" }], stored, false, false)).toBe(true);
    expect(tagsDirty(stored, stored, true, false)).toBe(true);
    expect(tagsValid([{ id: "1", name: " " }])).toBe(false);
    expect(tagsValid([{ id: "1", name: "x".repeat(MAX_NAME + 1) }])).toBe(false);
    expect(tagsValid([{ id: "1", name: "Bug" }])).toBe(true);
  });
  it("makes 12-character ids", () => {
    expect(newTagId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });
  it("stores a Unicode emoji as text and a custom one by id", () => {
    expect(tagEmojiOf({ kind: "unicode", text: "🔥", name: "fire" })).toBe("🔥");
    expect(tagEmojiOf({ kind: "custom", id: BOT, name: "x" })).toBe(BOT);
  });
  it("builds the edit body", () => {
    expect(tagsBody([{ id: "1", name: " Bug " }, { id: "2", name: "Idea", emoji: "💡" }], true)).toEqual({
      forum_tags: [
        { id: "1", name: "Bug" },
        { id: "2", name: "Idea", emoji: "💡" },
      ],
      require_tag: true,
    });
  });
});

describe("Zrzur Assistant", () => {
  it("accepts only a zrzur.com https service and a bot id in a release build", () => {
    expect(resolveAssistant("https://assistant.zrzur.com/", BOT, false)).toEqual({ url: "https://assistant.zrzur.com", botId: BOT });
    expect(resolveAssistant("https://evil.example", BOT, false)).toBeUndefined();
    expect(resolveAssistant("http://assistant.zrzur.com", BOT, false)).toBeUndefined();
    expect(resolveAssistant("https://assistant.zrzur.com", "nope", false)).toBeUndefined();
    expect(resolveAssistant(undefined, BOT, false)).toBeUndefined();
    // a development build may use the local stack
    expect(resolveAssistant("http://10.0.2.2:8080", BOT, true)).toEqual({ url: "http://10.0.2.2:8080", botId: BOT });
  });
  it("encodes PKCE values as base64url", () => {
    expect(base64url(new Uint8Array([251, 255, 0]))).toBe("-_8A");
    expect(base64ToUrl("ab+/cd==")).toBe("ab-_cd");
  });
  it("takes the code only when the state is ours", () => {
    expect(codeFrom("https://a.zrzur.com/oauth/callback?code=c1&state=s1", "s1")).toBe("c1");
    expect(codeFrom("https://a.zrzur.com/oauth/callback?code=c1&state=other", "s1")).toBeNull();
    expect(codeFrom("not a url", "s1")).toBeNull();
  });
  it("shows the messages tab only for modules with messages", () => {
    expect(tabsOf({ messages: [] })).toEqual(["settings", "permissions", "log", "data"]);
    expect(tabsOf({ messages: [1] })).toEqual(["settings", "messages", "permissions", "log", "data"]);
  });
  it("splits lines and dates the purge", () => {
    expect(linesOf(" a \n\n b")).toEqual(["a", "b"]);
    expect(purgeDate(null)).toBeUndefined();
    expect(purgeDate(0)).toBeUndefined();
    expect(purgeDate(1000)?.getTime()).toBe(1000 + 30 * 86_400_000);
  });
});
