import { i18n } from "@lingui/core";

import { ACTION_TYPES, describeEntry, type Names } from "../auditText";
import { newRule, parseList, problemOf, type Rule, upsertRule } from "../automod";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

describe("filter rules", () => {
  it("splits typed lists on lines and both commas", () => {
    expect(parseList("spam\n bad , word،كلمة\n\n")).toEqual(["spam", "bad", "word", "كلمة"]);
  });

  it("gives new rules the first free id", () => {
    const a = newRule([]);
    expect(a.id).toBe("rule1");
    expect(newRule([a, { ...a, id: "rule2" }]).id).toBe("rule3");
    expect(newRule([{ ...a, id: "rule2" }]).id).toBe("rule3");
  });

  it("replaces a rule in place or appends it", () => {
    const a = { ...newRule([]), name: "A" };
    const b = { ...newRule([a]), name: "B" };
    expect(upsertRule([a, b], { ...a, name: "A2" }).map((r) => r.name)).toEqual(["A2", "B"]);
    expect(upsertRule([a], b).map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("names the first problem like the web", () => {
    const base: Rule = { ...newRule([]), name: "x", trigger: { type: "Keywords", words: ["a"] } };
    expect(problemOf(base)).toBeNull();
    expect(problemOf({ ...base, name: " " })).toBe("name");
    expect(problemOf({ ...base, trigger: { type: "Keywords", words: [] } })).toBe("words");
    expect(problemOf({ ...base, trigger: { type: "MentionSpam", max: 51 } })).toBe("numbers");
    expect(problemOf({ ...base, trigger: { type: "RepeatedMessages", channels: 1, seconds: 30 } })).toBe("numbers");
    expect(problemOf({ ...base, trigger: { type: "LinkSpam", new_member_minutes: null, allowed_domains: [] } })).toBe("link");
    expect(problemOf({ ...base, actions: {} })).toBe("action");
  });
});

describe("audit log", () => {
  const names: Names = {
    user: (id) => (id ? `@${id}` : "someone"),
    channel: (id, fallback) => `#${id ?? fallback ?? "deleted channel"}`,
    role: (id, fallback) => id ?? fallback ?? "deleted role",
  };

  it("writes the web sentences", () => {
    expect(describeEntry(i18n, { type: "BanCreate", user: "u1" }, names).text).toBe("banned @u1");
    expect(describeEntry(i18n, { type: "MessageBulkDelete", count: 3, channel: "c1" }, names).text).toBe("deleted 3 messages in #c1");
    expect(describeEntry(i18n, { type: "EmojiCreate", name: "party" }, names).text).toBe("added emoji :party:");
    expect(describeEntry(i18n, { type: "Unknown" }, names)).toEqual({ text: "Unknown", kind: "edit", icon: "info" });
  });

  it("tells member edits apart", () => {
    expect(describeEntry(i18n, { type: "MemberEdit", user: "u", after: { timeout: "x" } }, names)).toMatchObject({ text: "timed out @u", kind: "delete" });
    expect(describeEntry(i18n, { type: "MemberEdit", user: "u", before: { timeout: "x" }, after: {} }, names).text).toBe("ended @u's timeout");
    expect(describeEntry(i18n, { type: "MemberEdit", user: "u", after: { roles: [] } }, names).text).toBe("changed @u's roles");
    expect(describeEntry(i18n, { type: "MemberEdit", user: "u", after: { nickname: "n" } }, names).text).toBe("changed @u's nickname");
  });

  it("sends the web's type lists", () => {
    expect(ACTION_TYPES.roles).toEqual(["RoleCreate", "RoleEdit", "RoleDelete", "RolesReorder"]);
    expect(ACTION_TYPES.server).toEqual(["ServerEdit"]);
  });
});
