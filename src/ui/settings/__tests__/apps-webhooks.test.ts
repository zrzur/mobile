import { i18n } from "@lingui/core";

import { commandDescription, commandTitle, freeTargets, grantedPermissions, hasBit, localized, removeRule, type Rule, ruleCount, setRule, sortCommands, sortRules } from "../apps";
import { channelLabel, codePoints, filterWebhooks, groupByChannel, newestFirst, webhookChanges, webhookFacts, webhookNameProblem } from "../webhooks";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

const SERVER = "S1";

describe("command rules", () => {
  it("adds a rule and replaces the one for the same target", () => {
    const a: Rule = { id: "R1", type: "Role", permission: true };
    const list = setRule([a], { id: "R2", type: "Role", permission: false });
    expect(list).toHaveLength(2);
    const replaced = setRule(list, { id: "R1", type: "Role", permission: false });
    expect(replaced).toEqual([
      { id: "R1", type: "Role", permission: false },
      { id: "R2", type: "Role", permission: false },
    ]);
    // the same id as another kind is a different target
    expect(setRule([a], { id: "R1", type: "Channel", permission: true })).toHaveLength(2);
  });

  it("removes one rule only", () => {
    const list: Rule[] = [
      { id: "X", type: "Role", permission: true },
      { id: "X", type: "Member", permission: true },
    ];
    expect(removeRule(list, "Role", "X")).toEqual([{ id: "X", type: "Member", permission: true }]);
  });

  it("sorts Everyone and Every channel first, then roles, members, channels", () => {
    const list: Rule[] = [
      { id: "C1", type: "Channel", permission: true },
      { id: "M1", type: "Member", permission: true },
      { id: SERVER, type: "Channel", permission: false },
      { id: "R1", type: "Role", permission: true },
      { id: SERVER, type: "Role", permission: true },
      { id: "R2", type: "Role", permission: false },
    ];
    expect(sortRules(list, SERVER).map((r) => `${r.type}:${r.id}`)).toEqual(["Role:S1", "Channel:S1", "Role:R1", "Role:R2", "Member:M1", "Channel:C1"]);
  });

  it("offers only targets without a rule of that kind", () => {
    const rules: Rule[] = [{ id: "A", type: "Role", permission: true }];
    expect(freeTargets([{ id: "A" }, { id: "B" }], rules, "Role")).toEqual([{ id: "B" }]);
    expect(freeTargets([{ id: "A" }, { id: "B" }], rules, "Channel")).toEqual([{ id: "A" }, { id: "B" }]);
  });
});

describe("commands", () => {
  const cmd = (name: string, extra: Partial<Parameters<typeof commandTitle>[0]> = {}) => ({ _id: name + (extra.server_id ?? ""), type: "ChatInput" as const, name, ...extra });

  it("names slash commands with a slash and localizes them", () => {
    expect(commandTitle(cmd("ping"), "en")).toBe("/ping");
    expect(commandTitle(cmd("ping", { name_localizations: { ar: "نقر" } }), "ar")).toBe("/نقر");
    expect(commandTitle(cmd("Report", { type: "Message" }), "de")).toBe("Report");
    expect(commandDescription(cmd("ping", { description: "Pong", description_localizations: { de: "Pong!" } }), "de-AT")).toBe("Pong!");
    expect(localized("x", null, "ar")).toBe("x");
    expect(localized("x", { "zh-Hans": "中" }, "zh-Hans")).toBe("中");
  });

  it("sorts by name, global before server-only", () => {
    const list = [cmd("zeta"), cmd("alpha", { server_id: SERVER }), cmd("alpha")];
    expect(sortCommands(list).map((c) => `${c.name}:${c.server_id ?? "global"}`)).toEqual(["alpha:global", "alpha:S1", "zeta:global"]);
  });
});

describe("granted permissions", () => {
  it("reads bits past 2^31 and keeps the web order", () => {
    expect(hasBit(2 ** 40, 2 ** 40)).toBe(true);
    expect(hasBit(2 ** 40, 2 ** 39)).toBe(false);
    // ManageWebhooks (24) comes right after the first server rights, before KickMembers (6)
    const granted = grantedPermissions(2 ** 6 + 2 ** 24 + 2 ** 1);
    expect(granted).toEqual(["ManageServer", "ManageWebhooks", "KickMembers"]);
    expect(grantedPermissions(0)).toEqual([]);
  });
});

describe("webhook names", () => {
  it("counts code points like the server", () => {
    expect(codePoints("😀😀")).toBe(2);
    expect(webhookNameProblem("   ")).toBe("empty");
    expect(webhookNameProblem("😀".repeat(80))).toBeUndefined();
    expect(webhookNameProblem("😀".repeat(81))).toBe("long");
    expect(webhookNameProblem(` ${"a".repeat(80)} `)).toBeUndefined();
  });
});

describe("webhook list", () => {
  const hooks = [
    { id: "1", channelId: "A", creatorId: "bot", createdAt: 1 },
    { id: "2", channelId: "B", creatorId: "me", createdAt: 3 },
    { id: "3", channelId: "A", creatorId: "me", createdAt: 2 },
  ];
  const isBot = (id: string) => id === "bot";

  it("filters by maker", () => {
    expect(filterWebhooks(hooks, "all", isBot)).toHaveLength(3);
    expect(filterWebhooks(hooks, "bots", isBot).map((h) => h.id)).toEqual(["1"]);
    expect(filterWebhooks(hooks, "people", isBot).map((h) => h.id)).toEqual(["2", "3"]);
  });

  it("groups per channel, newest first", () => {
    const groups = groupByChannel(newestFirst(hooks));
    expect(groups.map((g) => [g.channelId, g.hooks.map((h) => h.id)])).toEqual([
      ["B", ["2"]],
      ["A", ["3", "1"]],
    ]);
  });

  it("isolates the channel name for right-to-left text", () => {
    expect(channelLabel("عام")).toBe("⁨#عام⁩");
  });

  it("writes who made it and when it was used", () => {
    const made = Date.UTC(2026, 10, 3, 12);
    const used = Date.UTC(2026, 10, 20, 12);
    expect(webhookFacts(i18n, { creator: "Lina", createdAt: made })).toBe("Created by Lina on Nov 3, 2026. Not used yet.");
    expect(webhookFacts(i18n, { creator: "Lina", createdAt: made, lastUsed: used })).toBe("Created by Lina on Nov 3, 2026. Last used Nov 20, 2026.");
  });

  it("sends only what changed", () => {
    const before = { name: "Feed", channelId: "A" };
    expect(webhookChanges(before, { name: " Feed ", channelId: "A" })).toEqual({ remove: [] });
    expect(webhookChanges(before, { name: "News", channelId: "B", avatar: "file1" })).toEqual({ name: "News", channel_id: "B", avatar: "file1", remove: [] });
    expect(webhookChanges(before, { name: "Feed", channelId: "A", avatar: null })).toEqual({ remove: ["Avatar"] });
  });
});

describe("rule count", () => {
  it("says one rule or many", () => {
    expect(ruleCount(i18n, 1)).toBe("1 rule");
    expect(ruleCount(i18n, 3)).toBe("3 rules");
  });
});
