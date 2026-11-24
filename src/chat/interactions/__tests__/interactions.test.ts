import {
  collectOptions,
  commandsKey,
  dedupeCommands,
  dmCommands,
  EPHEMERAL_LIFETIME_MS,
  ephemeralExpiry,
  filterCommands,
  initialModalValue,
  knownBlocks,
  levelOf,
  messageCommands,
  modalAnswers,
  type ModalComponent,
  modalItems,
  modalProblem,
  readStoredEphemeral,
  resolveOption,
  restrictionAllows,
  safeColour,
  safeUrl,
  slashQuery,
  toggleValue,
  typedCommand,
  ulidMs,
  withEphemeral,
  wrapOptions,
} from "../logic";
import type { ApplicationCommand, CommandOption, ComponentBlock } from "../types";
import { localized } from "../types";

const cmd = (name: string, patch: Partial<ApplicationCommand> = {}): ApplicationCommand => ({ _id: `id-${name}-${patch.server_id ?? "g"}`, application_id: "BOT", type: "ChatInput", name, version: "1", ...patch });
const label = (c: ApplicationCommand) => c.name;

describe("command lists", () => {
  it("keeps the server's copy of a command over the global one", () => {
    const list = dedupeCommands([cmd("close"), cmd("close", { server_id: "S" }), cmd("open")]);
    expect(list.map((c) => [c.name, c.server_id])).toEqual([
      ["close", "S"],
      ["open", undefined],
    ]);
  });

  it("finds a command typed in full, only when exactly one matches", () => {
    const list = [cmd("close"), cmd("open"), cmd("ping", { application_id: "A" }), cmd("ping", { application_id: "B" })];
    expect(typedCommand("/close", list, label)?.name).toBe("close");
    expect(typedCommand("/close  ", list, label)?.name).toBe("close");
    expect(typedCommand("/ping", list, label)).toBeUndefined();
    expect(typedCommand("/close now", list, label)).toBeUndefined();
    expect(typedCommand("close", list, label)).toBeUndefined();
  });

  it("offers a bot's DM only its global commands that need no server", () => {
    const list = dmCommands({ _id: "BOT", username: "bot" }, [cmd("a"), cmd("b", { server_id: "S" }), cmd("c", { default_member_permissions: 8 }), cmd("d", { nsfw: true })]);
    expect(list.commands.map((c) => c.name)).toEqual(["a"]);
    expect(list.applications[0]._id).toBe("BOT");
  });

  it("opens the picker only for a slash and one word", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/he")).toBe("he");
    expect(slashQuery("/he llo")).toBeUndefined();
    expect(slashQuery("hello")).toBeUndefined();
  });

  it("filters chat commands: names starting with the word first, then containing it, then by bot", () => {
    const list = [cmd("helper"), cmd("the-help"), cmd("ban"), cmd("menu", { type: "Message" }), cmd("hello", { application_id: "OTHER" })];
    expect(filterCommands(list, "hel", label).map((c) => c.name)).toEqual(["helper", "hello", "the-help"]);
    expect(filterCommands(list, "", label).map((c) => c.name)).toEqual(["ban", "hello", "helper", "the-help"]);
    expect(filterCommands(list, "", label, "OTHER").map((c) => c.name)).toEqual(["hello"]);
    expect(messageCommands(list).map((c) => c.name)).toEqual(["menu"]);
  });

  it("asks a channel's commands from its server (a thread from its channel) or a bot's DM", () => {
    expect(commandsKey({ id: "C", type: "TextChannel", serverId: "S" })).toBe("S#C");
    expect(commandsKey({ id: "T", type: "TextChannel", serverId: "S", parentId: "C" })).toBe("S#C");
    expect(commandsKey({ id: "D", type: "DirectMessage", recipient: { id: "BOT", bot: {} } })).toBe("dm:BOT");
    expect(commandsKey({ id: "D", type: "DirectMessage", recipient: { id: "U" } })).toBeUndefined();
    expect(commandsKey({ id: "G", type: "Group" })).toBeUndefined();
  });

  it("reads localised names with a language fallback", () => {
    expect(localized("hello", { ar: "مرحبا", de: "hallo" }, "ar")).toBe("مرحبا");
    expect(localized("hello", { de: "hallo" }, "de-AT")).toBe("hallo");
    expect(localized("hello", undefined, "ar")).toBe("hello");
  });
});

describe("who may use a component", () => {
  it("lets anyone use an unrestricted one, else the listed people or roles", () => {
    expect(restrictionAllows(undefined, "U", [])).toBe(true);
    expect(restrictionAllows({ users: [], roles: [] }, undefined, [])).toBe(true);
    expect(restrictionAllows({ users: ["U"] }, "U", [])).toBe(true);
    expect(restrictionAllows({ users: ["X"], roles: ["R"] }, "U", ["R"])).toBe(true);
    expect(restrictionAllows({ users: ["X"], roles: ["R"] }, "U", ["Q"])).toBe(false);
  });
});

describe("the command form", () => {
  const opt = (name: string, type: CommandOption["type"], patch: Partial<CommandOption> = {}): CommandOption => ({ name, type, description: "", ...patch });

  it("turns the filled fields into option values", () => {
    expect(resolveOption(opt("n", "Integer"), { text: "42" })).toEqual({ value: 42 });
    expect(resolveOption(opt("n", "Integer"), { text: "٤٢" })).toEqual({ value: 42 });
    expect(resolveOption(opt("n", "Number"), { text: "1,5" })).toEqual({ value: 1.5 });
    expect(resolveOption(opt("n", "Integer"), { text: "1.5" })).toEqual({ error: "number" });
    expect(resolveOption(opt("n", "Integer", { max_value: 10 }), { text: "11" })).toEqual({ error: "number" });
    expect(resolveOption(opt("s", "String"), { text: " hi " })).toEqual({ value: "hi" });
    expect(resolveOption(opt("s", "String", { choices: [{ name: "Red", value: "r" }] }), { text: "red" })).toEqual({ value: "r" });
    expect(resolveOption(opt("s", "String", { choices: [{ name: "Red", value: "r" }] }), { text: "blue" })).toEqual({ error: "choice" });
    expect(resolveOption(opt("u", "User"), { text: "bob" })).toEqual({ error: "pick" });
    expect(resolveOption(opt("u", "User"), { value: "U1", label: "Bob" })).toEqual({ value: "U1" });
    expect(resolveOption(opt("f", "Attachment"), { text: "x" })).toEqual({ error: "file" });
    expect(resolveOption(opt("s", "String", { required: true }), undefined)).toEqual({ error: "missing" });
    expect(resolveOption(opt("s", "String"), undefined)).toEqual({});
  });

  it("collects all values or names the first bad option", () => {
    const options = [opt("a", "String", { required: true }), opt("b", "Integer")];
    expect(collectOptions(options, { a: { text: "x" }, b: { text: "3" } }).options).toEqual([
      { name: "a", type: "String", value: "x" },
      { name: "b", type: "Integer", value: 3 },
    ]);
    expect(collectOptions(options, { b: { text: "3" } }).failed).toMatchObject({ option: { name: "a" }, error: "missing" });
    expect(collectOptions(options, { a: { text: "x" } }).options).toHaveLength(1);
  });

  it("wraps values in the chosen sub-command and group", () => {
    const group = opt("config", "SubCommandGroup");
    const sub = opt("set", "SubCommand");
    expect(wrapOptions([group, sub], [{ name: "v", type: "String", value: "x" }])).toEqual([
      { name: "config", type: "SubCommandGroup", options: [{ name: "set", type: "SubCommand", options: [{ name: "v", type: "String", value: "x" }] }] },
    ]);
    expect(wrapOptions([], [])).toEqual([]);
  });

  it("asks for a sub-command first, then shows required fields first", () => {
    expect(levelOf([opt("a", "SubCommand"), opt("b", "String")]).subs).toHaveLength(1);
    expect(levelOf([opt("a", "String"), opt("b", "String", { required: true })]).fields.map((o) => o.name)).toEqual(["b", "a"]);
    expect(levelOf(undefined)).toEqual({ subs: [], fields: [] });
  });
});

describe("private answers", () => {
  // 01J… encodes 2024-06; any valid ULID works for the maths
  const id = "01J00000000000000000000000";
  it("reads the time inside a ULID and expires the answer 15 minutes later", () => {
    const at = ulidMs(id)!;
    expect(at).toBeGreaterThan(1.7e12);
    expect(ephemeralExpiry({ _id: id })).toBe(at + EPHEMERAL_LIFETIME_MS);
    expect(ulidMs("not-an-id")).toBeUndefined();
    expect(ephemeralExpiry({ _id: "x" })).toBeUndefined();
  });

  it("keeps only answers that have not expired", () => {
    const at = ulidMs(id)!;
    const stored = { C1: [{ _id: id, interaction_id: "I", author: "B", channel_id: "C1" }, { _id: "bad" }], C2: "nope" };
    expect(readStoredEphemeral(stored, at + 1000).C1).toHaveLength(1);
    expect(readStoredEphemeral(stored, at + EPHEMERAL_LIFETIME_MS + 1)).toEqual({});
    expect(readStoredEphemeral([], 0)).toEqual({});
  });

  it("adds an answer or replaces its edited copy", () => {
    const m = { _id: id, interaction_id: "I", author: "B", channel_id: "C" };
    const once = withEphemeral(undefined, m);
    const twice = withEphemeral(once, { ...m, content: "edited" });
    expect(twice).toHaveLength(1);
    expect(twice[0].content).toBe("edited");
  });
});

describe("a bot's form", () => {
  const blocks = [
    { type: "Text", content: "Tell us more" },
    { type: "Field", label: "Name", component: { type: "TextInput", custom_id: "name", style: "Short", min_length: 2 } },
    { type: "ActionRow", components: [{ type: "TextInput", custom_id: "bio", style: "Paragraph", label: "Bio", required: false }] },
    { type: "Field", label: "Colour", component: { type: "RadioGroup", custom_id: "colour", options: [{ label: "Red", value: "r", default: true }, { label: "Blue", value: "b" }] } },
    { type: "Field", label: "Tags", component: { type: "CheckboxGroup", custom_id: "tags", options: [{ label: "A", value: "a" }], min_values: 1 } },
    { type: "Field", label: "Agree", component: { type: "Checkbox", custom_id: "agree" } },
    { type: "Field", label: "Proof", component: { type: "FileUpload", custom_id: "proof" } },
    { type: "Field", label: "Who", component: { type: "UserSelect", custom_id: "who", default_values: ["U1"] } },
    { type: "Separator" },
  ] as unknown as ComponentBlock[];

  it("lists text lines and fields in order", () => {
    const items = modalItems(blocks);
    expect(items.map((i) => (i.kind === "text" ? "text" : i.label))).toEqual(["text", "Name", "Bio", "Colour", "Tags", "Agree", "Proof", "Who"]);
  });

  it("starts with the bot's defaults", () => {
    const fields = modalItems(blocks).flatMap((i) => (i.kind === "field" ? [i] : []));
    const values = Object.fromEntries(fields.map((f) => [f.component.custom_id, initialModalValue(f.component)]));
    expect(values).toEqual({ name: "", bio: "", colour: "r", tags: [], agree: false, proof: [], who: ["U1"] });
  });

  it("names the first field that is not filled in as asked", () => {
    const fields = modalItems(blocks).flatMap((i) => (i.kind === "field" ? [i] : []));
    const base = { name: "Al", bio: "", colour: "r", tags: ["a"], agree: false, who: ["U1"] };
    expect(modalProblem(fields, { ...base, name: "" }, { proof: ["F"] })).toEqual({ kind: "fill", label: "Name" });
    expect(modalProblem(fields, { ...base, name: "A" }, { proof: ["F"] })).toEqual({ kind: "short", label: "Name", min: 2 });
    expect(modalProblem(fields, { ...base, colour: "" }, { proof: ["F"] })).toEqual({ kind: "choose", label: "Colour" });
    expect(modalProblem(fields, { ...base, tags: [] }, { proof: ["F"] })).toEqual({ kind: "atLeast", label: "Tags", min: 1 });
    expect(modalProblem(fields, base, {})).toEqual({ kind: "file", label: "Proof" });
    expect(modalProblem(fields, { ...base, who: [] }, { proof: ["F"] })).toEqual({ kind: "choose", label: "Who" });
    expect(modalProblem(fields, base, { proof: ["F"] })).toBeUndefined();
  });

  it("sends each field in the shape the bot reads", () => {
    const fields = modalItems(blocks).flatMap((i) => (i.kind === "field" ? [i] : []));
    const answers = modalAnswers(fields, { name: "Al", bio: "", colour: "", tags: ["a"], agree: true, who: ["U1"] }, { proof: ["F"] });
    expect(answers).toEqual([
      { custom_id: "name", value: "Al" },
      { custom_id: "bio", value: "" },
      { custom_id: "colour", value: undefined },
      { custom_id: "tags", values: ["a"] },
      { custom_id: "agree", checked: true },
      { custom_id: "proof", values: ["F"] },
      { custom_id: "who", values: ["U1"] },
    ]);
  });

  it("toggles a choice within the limit", () => {
    expect(toggleValue([], "a", 1)).toEqual(["a"]);
    expect(toggleValue(["a"], "b", 1)).toEqual(["b"]);
    expect(toggleValue(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a", 2)).toEqual(["b"]);
  });

  it("only text inputs of a known kind become fields", () => {
    const c = { type: "TextInput", custom_id: "x", style: "Short" } as ModalComponent;
    expect(initialModalValue(c)).toBe("");
  });
});

describe("message blocks", () => {
  it("keeps the blocks this app can draw", () => {
    expect(knownBlocks([{ type: "Text", content: "a" }, { type: "Field" }, { type: "Future" }, null]).map((b) => b.type)).toEqual(["Text"]);
    expect(knownBlocks(undefined)).toEqual([]);
  });

  it("accepts only safe colours and web links from a bot", () => {
    expect(safeColour("#E0195F")).toBe("#E0195F");
    expect(safeColour("red")).toBeUndefined();
    expect(safeUrl("https://zrzur.com")).toBe("https://zrzur.com");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
  });
});
