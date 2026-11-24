import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * Webhooks, the parts without UI (web: settings/server/webhooks/
 * webhookName.ts, webhookFilter.ts and the lines of ServerWebhooks).
 */

/** Longest webhook name, as on the server */
export const WEBHOOK_NAME_MAX = 80;

/** Length in code points (an emoji counts once), like the server counts */
export function codePoints(text: string): number {
  return [...text].length;
}

/** What is wrong with a webhook name, if anything (1 to 80 characters) */
export function webhookNameProblem(name: string): "empty" | "long" | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (codePoints(trimmed) > WEBHOOK_NAME_MAX) return "long";
  return undefined;
}

/** Which webhooks to list, by who made them */
export type WebhookMaker = "all" | "bots" | "people";

/** Webhooks made by bots, by people, or all of them */
export function filterWebhooks<T extends { creatorId: string }>(hooks: T[], maker: WebhookMaker, isBot: (userId: string) => boolean): T[] {
  if (maker === "all") return hooks;
  return hooks.filter((hook) => isBot(hook.creatorId) === (maker === "bots"));
}

/** Groups per channel, in the order the list has them (newest first) */
export function groupByChannel<T extends { channelId: string }>(hooks: T[]): { channelId: string; hooks: T[] }[] {
  const byChannel = new Map<string, T[]>();
  for (const hook of hooks) {
    const list = byChannel.get(hook.channelId);
    if (list) list.push(hook);
    else byChannel.set(hook.channelId, [hook]);
  }
  return [...byChannel.entries()].map(([channelId, list]) => ({ channelId, hooks: list }));
}

/** Newest first */
export function newestFirst<T extends { createdAt: number }>(hooks: T[]): T[] {
  return [...hooks].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * "#name" for lists, isolated from the text around it, so right-to-left
 * text keeps the # in front instead of moving it to the end.
 */
export function channelLabel(name: string): string {
  return `⁨#${name}⁩`;
}

/** A medium date in the app's language */
export function mediumDate(time: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : locale, { dateStyle: "medium" }).format(new Date(time));
}

/** The line under a webhook: who made it, when, and when it last posted */
export function webhookFacts(i18n: I18n, hook: { creator: string; createdAt: number; lastUsed?: number }): string {
  const creator = hook.creator;
  const made = mediumDate(hook.createdAt, i18n.locale);
  if (hook.lastUsed) {
    const used = mediumDate(hook.lastUsed, i18n.locale);
    return i18n._(msg`Created by ${creator} on ${made}. Last used ${used}.`);
  }
  return i18n._(msg`Created by ${creator} on ${made}. Not used yet.`);
}

/** The edit as the API wants it: only what changed */
export function webhookChanges(
  before: { name: string; channelId: string },
  after: { name: string; channelId: string; avatar?: string | null },
): { name?: string; channel_id?: string; avatar?: string; remove: "Avatar"[] } {
  const changes: { name?: string; channel_id?: string; avatar?: string; remove: "Avatar"[] } = { remove: [] };
  const name = after.name.trim();
  if (name !== before.name) changes.name = name;
  if (after.channelId !== before.channelId) changes.channel_id = after.channelId;
  if (after.avatar === null) changes.remove.push("Avatar");
  else if (after.avatar) changes.avatar = after.avatar;
  return changes;
}
