/**
 * Pure rules of the developer platform (web: commandList.ts,
 * restriction.ts, ephemeralStorage.ts and the option parsing of
 * CommandPicker.tsx), kept apart so they can be tested.
 */
import { foldText, textMatches, withoutArticle } from "@/ui/find/fold";

import type { ApplicationCommand, CommandApplication, CommandOption, Component, ComponentBlock, DataOption, EphemeralMessage, ModalFieldValue, OptionValue, ServerCommands } from "./types";

// ----- commands -----

/**
 * One entry per bot, kind and name: a bot's command limited to this server
 * wins over its global one with the same name.
 */
export function dedupeCommands(commands: ApplicationCommand[]): ApplicationCommand[] {
  const kept = new Map<string, ApplicationCommand>();
  for (const command of commands) {
    const key = `${command.application_id}\u0000${command.type}\u0000${command.name}`;
    const seen = kept.get(key);
    if (!seen || (!seen.server_id && command.server_id)) {
      if (seen) kept.delete(key);
      kept.set(key, command);
    }
  }
  return [...kept.values()];
}

/**
 * The command a draft names in full, like `/close`: only when the draft is
 * exactly one slash word and exactly one chat command has that name.
 */
export function typedCommand(text: string, commands: ApplicationCommand[], label: (command: ApplicationCommand) => string): ApplicationCommand | undefined {
  const typed = /^\/(\S+)\s*$/.exec(text)?.[1];
  if (!typed) return undefined;
  const found = commands.filter((c) => c.type === "ChatInput" && (label(c) === typed || c.name === typed));
  return found.length === 1 ? found[0] : undefined;
}

/** The commands of a DM with a bot: its global ones that work without a server */
export function dmCommands(bot: CommandApplication, commands: ApplicationCommand[]): ServerCommands {
  return {
    applications: [bot],
    commands: commands.filter((c) => !c.server_id && c.default_member_permissions === undefined && !c.nsfw),
  };
}

/** The query typed after `/` while the picker is open, or undefined when it is not */
export function slashQuery(text: string): string | undefined {
  const match = /^\/(\S*)$/.exec(text);
  return match ? match[1] : undefined;
}

/** Chat commands matching the query, optionally of one bot; names starting with it first */
export function filterCommands(commands: ApplicationCommand[], query: string, label: (c: ApplicationCommand) => string, app?: string): ApplicationCommand[] {
  const q = query.toLocaleLowerCase();
  const list = dedupeCommands(commands).filter((c) => c.type === "ChatInput" && (!app || c.application_id === app));
  if (!q) return list.sort((a, b) => label(a).localeCompare(label(b)));
  const starts: ApplicationCommand[] = [];
  const contains: ApplicationCommand[] = [];
  for (const c of list) {
    const names = [label(c).toLocaleLowerCase(), c.name.toLocaleLowerCase()];
    if (names.some((n) => n.startsWith(q))) starts.push(c);
    else if (names.some((n) => n.includes(q))) contains.push(c);
  }
  return [...starts, ...contains];
}

/** One row of the commands sheet: a chat command with the bot it belongs to */
export type CommandEntry = { command: ApplicationCommand; name: string; description: string; bot: string };

/**
 * The commands sheet's list (web: CommandPicker `matches`, phone sheet):
 * chat commands of the bots here, one per bot and name, NSFW ones only in an
 * NSFW channel, optionally of one bot. The search is folded like every
 * search in the app (case, Arabic letter forms, tashkeel, ال) and looks in
 * the name, the description and the bot's name; every typed word must be
 * found. Order: names starting with the search first (as on the web), then
 * names containing it, then matches in the description or bot name; A-Z
 * inside each group.
 */
export function searchCommands(
  list: ServerCommands,
  query: string,
  text: { name: (c: ApplicationCommand) => string; description: (c: ApplicationCommand) => string },
  options: { app?: string; nsfw?: boolean } = {},
): CommandEntry[] {
  const botName = new Map(list.applications.map((a) => [a._id, a.display_name ?? a.username]));
  const entries = dedupeCommands(list.commands)
    .filter((c) => c.type === "ChatInput" && (options.nsfw || !c.nsfw) && (!options.app || c.application_id === options.app))
    .map((command) => ({ command, name: text.name(command), description: text.description(command), bot: botName.get(command.application_id) ?? "" }));
  const words = foldText(query).split(" ").filter(Boolean);
  const byName = (a: CommandEntry, b: CommandEntry) => a.name.localeCompare(b.name);
  if (!words.length) return entries.sort(byName);
  const rank = (e: CommandEntry) => {
    const names = [foldText(e.name), foldText(e.command.name)];
    const first = words[0];
    if (names.some((n) => n.startsWith(first) || n.startsWith(withoutArticle(first)) || withoutArticle(n).startsWith(first))) {
      if (words.every((w) => names.some((n) => textMatches(n, w)))) return 0;
    }
    if (words.every((w) => names.some((n) => textMatches(n, w)))) return 1;
    if (words.every((w) => textMatches(`${e.name} ${e.command.name} ${e.description} ${e.bot}`, w))) return 2;
    return -1;
  };
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || byName(a.entry, b.entry))
    .map((r) => r.entry);
}

/** The message commands (row 133: the "Apps" list of a message) */
export const messageCommands = (commands: ApplicationCommand[]) => dedupeCommands(commands).filter((c) => c.type === "Message");

/**
 * Where a channel's commands come from: its server, asked for this channel
 * so the channel rules apply (`<server>#<channel>`; a thread follows its
 * channel), or the bot of a DM with a bot (`dm:<bot id>`).
 */
export function commandsKey(channel: { id: string; type: string; serverId?: string; parentId?: string; recipient?: { id: string; bot?: unknown } }): string | undefined {
  if (channel.type === "TextChannel" && channel.serverId) return `${channel.serverId}#${channel.parentId ?? channel.id}`;
  if (channel.type === "DirectMessage" && channel.recipient?.bot) return `dm:${channel.recipient.id}`;
  return undefined;
}

// ----- who may use a component -----

export type Restriction = { users?: string[]; roles?: string[] };

/** Whether this person may use a component (the server decides for real) */
export function restrictionAllows(restrict: Restriction | undefined, userId: string | undefined, roleIds: string[]) {
  const users = restrict?.users ?? [];
  const roles = restrict?.roles ?? [];
  if (!users.length && !roles.length) return true;
  if (userId && users.includes(userId)) return true;
  return roleIds.some((role) => roles.includes(role));
}

// ----- the command form -----

/** What the form holds for one option: typed text, or a picked value with its shown label */
export type FieldValue = { text?: string; value?: OptionValue; label?: string };

export type OptionResult = { value?: OptionValue; error?: "missing" | "number" | "choice" | "pick" | "file" };

/** The value of one option from the form, or why it is not valid */
export function resolveOption(option: CommandOption, field: FieldValue | undefined): OptionResult {
  if (field?.value !== undefined) return { value: field.value };
  const raw = (field?.text ?? "").trim();
  if (!raw) return option.required ? { error: "missing" } : {};
  if (option.choices?.length) {
    const lower = raw.toLocaleLowerCase();
    const choice = option.choices.find((c) => c.name.toLocaleLowerCase() === lower || String(c.value) === raw);
    return choice ? { value: choice.value } : { error: "choice" };
  }
  switch (option.type) {
    case "Integer":
    case "Number": {
      const n = Number(raw.replace(",", ".").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
      if (!Number.isFinite(n) || (option.type === "Integer" && !Number.isInteger(n))) return { error: "number" };
      if (option.min_value !== undefined && n < option.min_value) return { error: "number" };
      if (option.max_value !== undefined && n > option.max_value) return { error: "number" };
      return { value: n };
    }
    case "Boolean":
      return { error: "choice" };
    case "User":
    case "Role":
    case "Channel":
    case "Mentionable":
      return { error: "pick" };
    case "Attachment":
      return { error: "file" };
    default:
      return { value: raw };
  }
}

/** All option values of the form, or the first option that is missing or invalid */
export function collectOptions(
  options: CommandOption[],
  fields: Record<string, FieldValue>,
): { options: DataOption[]; failed?: { option: CommandOption; error: NonNullable<OptionResult["error"]> } } {
  const out: DataOption[] = [];
  for (const option of options) {
    const result = resolveOption(option, fields[option.name]);
    if (result.error) return { options: [], failed: { option, error: result.error } };
    if (result.value !== undefined) out.push({ name: option.name, type: option.type, value: result.value });
  }
  return { options: out };
}

/** Wrap option values in the chosen sub-command (and group) */
export function wrapOptions(path: CommandOption[], leaf: DataOption[]): DataOption[] {
  let wrapped = leaf;
  for (const sub of [...path].reverse()) wrapped = [{ name: sub.name, type: sub.type, options: wrapped }];
  return wrapped;
}

/** The options to fill at a level: the sub-commands to choose from, or the fields (required first) */
export function levelOf(options: CommandOption[] | undefined): { subs: CommandOption[]; fields: CommandOption[] } {
  const list = options ?? [];
  const subs = list.filter((o) => o.type === "SubCommand" || o.type === "SubCommandGroup");
  if (subs.length) return { subs, fields: [] };
  return { subs: [], fields: [...list.filter((o) => o.required), ...list.filter((o) => !o.required)] };
}

// ----- private answers -----

/** Private answers live as long as their interaction token */
export const EPHEMERAL_LIFETIME_MS = 15 * 60 * 1000;

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The time inside a ULID (ms), or undefined for a bad id */
export function ulidMs(id: string): number | undefined {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) return undefined;
  let ms = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) ms = ms * 32 + B32.indexOf(ch);
  return ms;
}

/** When a private answer expires (ms), or undefined for a bad id */
export function ephemeralExpiry(message: { _id: string }) {
  const at = ulidMs(message._id);
  return at === undefined ? undefined : at + EPHEMERAL_LIFETIME_MS;
}

/** The stored private answers that have not expired yet, per channel */
export function readStoredEphemeral(parsed: unknown, now: number): Record<string, EphemeralMessage[]> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const kept: Record<string, EphemeralMessage[]> = {};
  for (const [channel, list] of Object.entries(parsed)) {
    if (!Array.isArray(list)) continue;
    const alive = list.filter((m): m is EphemeralMessage => {
      if (!m || typeof m._id !== "string") return false;
      const expiry = ephemeralExpiry(m);
      return expiry !== undefined && expiry > now;
    });
    if (alive.length) kept[channel] = alive;
  }
  return kept;
}

/** The list with one private answer added or replaced */
export function withEphemeral(list: EphemeralMessage[] | undefined, message: EphemeralMessage): EphemeralMessage[] {
  const next = [...(list ?? [])];
  const at = next.findIndex((m) => m._id === message._id);
  if (at >= 0) next[at] = message;
  else next.push(message);
  return next;
}

// ----- a bot's form (modal) -----

export type ModalComponent = Extract<Component, { custom_id: string }>;
export type ModalItem = { kind: "text"; content: string } | { kind: "field"; label: string; description?: string; component: ModalComponent };
export type ModalValue = string | string[] | boolean;

const FIELD_TYPES = new Set(["TextInput", "StringSelect", "UserSelect", "RoleSelect", "MentionableSelect", "ChannelSelect", "RadioGroup", "CheckboxGroup", "Checkbox", "FileUpload"]);

/** The form's text lines and fields in order (Field blocks, or an ActionRow's first control) */
export function modalItems(blocks: ComponentBlock[] | undefined): ModalItem[] {
  const items: ModalItem[] = [];
  for (const block of blocks ?? []) {
    if (block?.type === "Text") items.push({ kind: "text", content: block.content });
    else if (block?.type === "Field" && FIELD_TYPES.has(block.component?.type)) {
      items.push({ kind: "field", label: block.label, description: block.description, component: block.component as ModalComponent });
    } else if (block?.type === "ActionRow") {
      const c = block.components?.[0];
      if (!c || !FIELD_TYPES.has(c.type)) continue;
      const label = (c.type === "TextInput" && c.label) || ("placeholder" in c && c.placeholder) || (c as ModalComponent).custom_id;
      items.push({ kind: "field", label: label as string, component: c as ModalComponent });
    }
  }
  return items;
}

/** A field's starting value */
export function initialModalValue(c: ModalComponent): ModalValue {
  switch (c.type) {
    case "TextInput":
      return c.value ?? "";
    case "RadioGroup":
      return c.options.find((o) => o.default)?.value ?? "";
    case "Checkbox":
      return !!c.default;
    case "StringSelect":
    case "CheckboxGroup":
      return c.options.filter((o) => o.default).map((o) => o.value);
    case "UserSelect":
    case "RoleSelect":
    case "MentionableSelect":
    case "ChannelSelect":
      return c.default_values ?? [];
    default:
      return [];
  }
}

export type ModalProblem = { label: string } & ({ kind: "fill" } | { kind: "short"; min: number } | { kind: "choose" } | { kind: "atLeast"; min: number } | { kind: "file" });

/** The first field that is not filled in as the bot asks, or undefined */
export function modalProblem(fields: { label: string; component: ModalComponent }[], values: Record<string, ModalValue>, files: Record<string, string[]>): ModalProblem | undefined {
  for (const { label, component: c } of fields) {
    const value = values[c.custom_id];
    switch (c.type) {
      case "TextInput": {
        const text = typeof value === "string" ? value : "";
        if (!text.trim()) {
          if (c.required ?? true) return { kind: "fill", label };
          continue;
        }
        if (c.min_length && text.length < c.min_length) return { kind: "short", label, min: c.min_length };
        break;
      }
      case "RadioGroup":
        if ((c.required ?? true) && !value) return { kind: "choose", label };
        break;
      case "CheckboxGroup": {
        const min = c.min_values ?? ((c.required ?? true) ? 1 : 0);
        if ((Array.isArray(value) ? value : []).length < min) return { kind: "atLeast", label, min };
        break;
      }
      case "FileUpload": {
        const min = c.min_values ?? ((c.required ?? true) ? 1 : 0);
        if ((files[c.custom_id] ?? []).length < min) return { kind: "file", label };
        break;
      }
      case "Checkbox":
        break;
      default:
        if ((Array.isArray(value) ? value : []).length < (("min_values" in c && c.min_values) || 1)) return { kind: "choose", label };
    }
  }
  return undefined;
}

/** What is sent to the bot */
export function modalAnswers(fields: { component: ModalComponent }[], values: Record<string, ModalValue>, files: Record<string, string[]>): ModalFieldValue[] {
  return fields.map(({ component: c }) => {
    const custom_id = c.custom_id;
    const value = values[custom_id];
    switch (c.type) {
      case "TextInput":
        return { custom_id, value: value as string };
      case "RadioGroup":
        return { custom_id, value: (value as string) || undefined };
      case "Checkbox":
        return { custom_id, checked: value as boolean };
      case "FileUpload":
        return { custom_id, values: files[custom_id] ?? [] };
      default:
        return { custom_id, values: value as string[] };
    }
  });
}

/** Toggle one value of a multi-choice, within `max` */
export function toggleValue(list: string[], value: string, max: number): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (max <= 1) return [value];
  return list.length >= max ? list : [...list, value];
}

// ----- message blocks -----

const MESSAGE_BLOCKS = new Set(["ActionRow", "Text", "Section", "Gallery", "File", "Separator", "Container"]);

/** Blocks this app knows how to show in a message */
export function knownBlocks(blocks: unknown[] | undefined): ComponentBlock[] {
  return (blocks ?? []).filter((b) => MESSAGE_BLOCKS.has((b as ComponentBlock)?.type)) as ComponentBlock[];
}

/**
 * Ids of the message's files that its blocks show in place (File, Gallery
 * items, a Section's thumbnail, inside Containers too); the plain attachment
 * list leaves them out so nothing appears twice (web: placedAttachments).
 */
export function placedAttachments(blocks: unknown[] | undefined): Set<string> {
  const ids = new Set<string>();
  const visit = (list: ComponentBlock[]) => {
    for (const block of list) {
      const b = block as { type: string; attachment?: string; items?: { attachment?: string }[]; thumbnail?: { attachment?: string }; components?: unknown[] };
      if (b.type === "File" && b.attachment) ids.add(b.attachment);
      if (b.type === "Gallery") for (const item of b.items ?? []) if (item.attachment) ids.add(item.attachment);
      if (b.type === "Section" && b.thumbnail?.attachment) ids.add(b.thumbnail.attachment);
      if (b.type === "Container") visit(knownBlocks(b.components));
    }
  };
  visit(knownBlocks(blocks));
  return ids;
}

/** A safe `#rrggbb` accent, or undefined */
export const safeColour = (colour?: string) => (colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : undefined);

/** Only web links open from a bot's link button */
export const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);
