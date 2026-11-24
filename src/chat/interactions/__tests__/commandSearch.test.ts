import { searchCommands } from "../logic";
import type { ApplicationCommand, ServerCommands } from "../types";

const cmd = (name: string, patch: Partial<ApplicationCommand> = {}): ApplicationCommand => ({
  _id: `id-${patch.application_id ?? "VIGIL"}-${name}-${patch.server_id ?? "g"}`,
  application_id: "VIGIL",
  type: "ChatInput",
  name,
  version: "1",
  ...patch,
});

const list = (commands: ApplicationCommand[]): ServerCommands => ({
  applications: [
    { _id: "VIGIL", username: "vigil", display_name: "VIGIL" },
    { _id: "GAMES", username: "games", display_name: "Game Hall" },
  ] as ServerCommands["applications"],
  commands,
});

const text = {
  name: (c: ApplicationCommand) => c.name_localizations?.ar ?? c.name,
  description: (c: ApplicationCommand) => c.description ?? "",
};
const names = (entries: { name: string }[]) => entries.map((e) => e.name);

describe("the commands sheet search", () => {
  const data = list([
    cmd("settings", { description: "Kick, mute, warnings, roles and server management" }),
    cmd("games", { description: "Games :)" }),
    cmd("ranks", { description: "Show the ranks" }),
    cmd("warn", { description: "When a member reaches the most warnings…" }),
    cmd("trivia", { application_id: "GAMES", description: "A quiz round" }),
    cmd("menu", { type: "Message" }),
    cmd("spicy", { nsfw: true, description: "Only in NSFW channels" }),
  ]);

  it("lists every chat command A-Z with its bot when nothing is typed (no message commands, no NSFW)", () => {
    const all = searchCommands(data, "", text);
    expect(names(all)).toEqual(["games", "ranks", "settings", "trivia", "warn"]);
    expect(all.find((e) => e.name === "trivia")?.bot).toBe("Game Hall");
    expect(all.find((e) => e.name === "settings")?.description).toBe("Kick, mute, warnings, roles and server management");
  });

  it("offers NSFW commands only in an NSFW channel", () => {
    expect(names(searchCommands(data, "", text, { nsfw: true }))).toContain("spicy");
  });

  it("filters by one bot", () => {
    expect(names(searchCommands(data, "", text, { app: "GAMES" }))).toEqual(["trivia"]);
  });

  it("puts names starting with the search first, then names containing it, then description or bot matches", () => {
    // "ga": games starts with it; settings has no "ga"; trivia matches through its bot "Game Hall"
    expect(names(searchCommands(data, "ga", text))).toEqual(["games", "trivia"]);
    // "warn": warn (name) before settings (description "warnings")
    expect(names(searchCommands(data, "warn", text))).toEqual(["warn", "settings"]);
    // "an": ranks contains it in the name; settings has "management" in the description
    expect(names(searchCommands(data, "an", text))).toEqual(["ranks", "settings"]);
  });

  it("needs every typed word, ignores case and finds bot names", () => {
    expect(names(searchCommands(data, "VIGIL ranks", text))).toEqual(["ranks"]);
    expect(names(searchCommands(data, "GAME HALL", text))).toEqual(["trivia"]);
    expect(searchCommands(data, "nothing-like-this", text)).toEqual([]);
  });

  it("folds Arabic: alef forms, ta marbuta, tashkeel and the article", () => {
    const arabic = list([
      cmd("settings", { name_localizations: { ar: "الإعدادات" }, description: "التحكم بطرد وكتم" }),
      cmd("games", { name_localizations: { ar: "الالعاب" }, description: "ألعاب" }),
      cmd("warn", { name_localizations: { ar: "انذار" }, description: "إذا وصل العضو لأقصى إنذارات" }),
      cmd("ranks", { name_localizations: { ar: "الرتب" }, description: "عرض الرتب" }),
    ]);
    // typed without hamza and without the article: still the settings command first
    expect(names(searchCommands(arabic, "اعدادات", text))).toEqual(["الإعدادات"]);
    // "إنذار" with hamza: the name starts with it, so it comes first
    expect(names(searchCommands(arabic, "إنذار", text))).toEqual(["انذار"]);
    // tashkeel is ignored
    expect(names(searchCommands(arabic, "الرُّتب", text))).toEqual(["الرتب"]);
    // a word only in a description
    expect(names(searchCommands(arabic, "كتم", text))).toEqual(["الإعدادات"]);
  });

  it("keeps one entry per bot and name (the server's copy wins)", () => {
    const twice = list([cmd("ping"), cmd("ping", { server_id: "S", description: "server copy" })]);
    const found = searchCommands(twice, "", text);
    expect(found).toHaveLength(1);
    expect(found[0].description).toBe("server copy");
  });
});
