import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Permission } from "@zrzur/sdk";

import type { PermissionKey } from "./permissions";

/**
 * Server settings › Apps, the parts without UI (web: settings/server/apps/
 * rules.ts, addBotPermissions.ts and the command list of ServerAppPage).
 */

export type RuleType = "Role" | "Member" | "Channel";
/** One rule: a role, member or channel, allowed or denied */
export type Rule = { id: string; type: RuleType; permission: boolean };

/** Add a rule, replacing the one for the same target */
export function setRule(rules: Rule[], rule: Rule): Rule[] {
  const index = rules.findIndex((entry) => entry.type === rule.type && entry.id === rule.id);
  if (index < 0) return [...rules, rule];
  return rules.map((entry, i) => (i === index ? rule : entry));
}

/** Take one rule out */
export function removeRule(rules: Rule[], type: RuleType, id: string): Rule[] {
  return rules.filter((entry) => !(entry.type === type && entry.id === id));
}

const ORDER: Record<RuleType, number> = { Role: 1, Member: 2, Channel: 3 };

/** Everyone and every channel first (the server id), then roles, members and channels */
export function sortRules(rules: Rule[], serverId: string): Rule[] {
  const rank = (rule: Rule) => (rule.id === serverId ? ORDER[rule.type] / 10 : ORDER[rule.type]);
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => rank(a.rule) - rank(b.rule) || a.index - b.index)
    .map((entry) => entry.rule);
}

/** Targets the "Which one" list still offers: ids that have no rule of this kind yet */
export function freeTargets<T extends { id: string }>(list: T[], rules: Rule[], kind: RuleType): T[] {
  const taken = new Set(rules.filter((rule) => rule.type === kind).map((rule) => rule.id));
  return list.filter((entry) => !taken.has(entry.id));
}

type Localizations = Record<string, string> | null | undefined;

/** The text in the app's language, else its base language, else the default */
export function localized(fallback: string, map: Localizations, locale: string): string {
  if (!map) return fallback;
  return map[locale] ?? map[locale.split("-")[0]] ?? fallback;
}

export type AppCommand = {
  _id: string;
  server_id?: string | null;
  type: "ChatInput" | "User" | "Message";
  name: string;
  name_localizations?: Localizations;
  description?: string;
  description_localizations?: Localizations;
};

/** "/name" for slash commands, the bare name for context-menu ones */
export function commandTitle(command: AppCommand, locale: string): string {
  return `${command.type === "ChatInput" ? "/" : ""}${localized(command.name, command.name_localizations, locale)}`;
}

/** The command's description in the app's language */
export function commandDescription(command: AppCommand, locale: string): string {
  return localized(command.description ?? "", command.description_localizations, locale);
}

/** By name, then the global command before its server-only twin */
export function sortCommands<T extends AppCommand>(commands: T[]): T[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name) || Number(!!a.server_id) - Number(!!b.server_id));
}

/** Whether a permission bit is set; works past 2^31 (no bit operators) */
export const hasBit = (permissions: number, bit: number) => Math.floor(permissions / bit) % 2 === 1;

/** The web's permission order for a bot (server, members, messages, voice) */
const BIT_ORDER = [
  0, 1, 2, 3, 4, 24, 42, 40, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21, 22, 23, 25, 26, 27, 28, 29, 37, 38, 39, 41, 43, 44, 45, 30, 31, 32, 33, 34, 35, 36,
];

/**
 * The permissions an app was given when it was added, in the web's order.
 * Bits this app has no name for are left out.
 */
export function grantedPermissions(permissions: number): PermissionKey[] {
  const byBit = new Map<number, PermissionKey>();
  for (const key of Object.keys(Permission) as PermissionKey[]) {
    const value = Permission[key] as unknown;
    // composite values (GrantAll…) are never a single bit; the first name of a bit wins
    if ((typeof value === "bigint" || typeof value === "number") && !byBit.has(Number(value))) byBit.set(Number(value), key);
  }
  const keys: PermissionKey[] = [];
  const seen = new Set<number>();
  const take = (bit: number) => {
    if (seen.has(bit)) return;
    seen.add(bit);
    const key = byBit.get(bit);
    if (key && hasBit(permissions, bit)) keys.push(key);
  };
  for (const n of BIT_ORDER) take(2 ** n);
  for (let n = 0; n < 53; n++) take(2 ** n);
  return keys;
}

/** "1 rule" / "3 rules" in the app's language */
export function ruleCount(i18n: I18n, count: number): string {
  return i18n._(msg`${plural(count, { one: "# rule", other: "# rules" })}`);
}
