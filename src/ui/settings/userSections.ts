import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { IconName } from "@/ui/Icon";

/** User settings pages, grouped like the web (UserSettings.tsx) */
export type UserSectionId =
  | "account"
  | "profile"
  | "badges"
  | "sessions"
  | "connections"
  | "connected-apps"
  | "my-data"
  | "plus"
  | "subscriptions"
  | "support"
  | "feedback"
  | "reports"
  | "voice"
  | "appearance"
  | "notifications"
  | "data"
  | "language";

export type UserSection = {
  id: UserSectionId;
  title: string;
  icon: IconName;
  category: string;
  /** reached by link or tab only, never a row (web `hidden`) */
  hidden?: boolean;
};

export type UserSectionGates = {
  /** the server offers Feather (GET /billing/plans → available) */
  billing: boolean;
  /** the instance allows video (features.limits.default.video) */
  video: boolean;
};

/**
 * Feather on the phone is read-only (no in-app purchase yet). Switch this off
 * to hide the category even where the server offers billing.
 */
export const FEATHER_ON_PHONE = true;

/**
 * Every user settings page in web order. Excluded on the phone (spec §16):
 * Developer Portal, Trust & Safety, Keyboard shortcuts, Desktop, Advanced.
 */
export function userSections(i18n: I18n, gates: UserSectionGates): UserSection[] {
  const user = i18n._(msg`User settings`);
  const subscriptions = i18n._(msg`Subscriptions`);
  const help = i18n._(msg`Help & safety`);
  const client = i18n._(msg`Client settings`);
  const profile = i18n._(msg`Profile`);
  const feather = i18n._(msg`Zrzur Feather`);
  const feedback = i18n._(msg`Feedback & reports`);
  const out: UserSection[] = [
    { id: "account", title: i18n._(msg`My account`), icon: "user-circle", category: user, hidden: true },
    { id: "profile", title: profile, icon: "user-circle", category: user },
    { id: "badges", title: profile, icon: "medal", category: user, hidden: true },
    { id: "sessions", title: i18n._(msg`Sessions`), icon: "shield-check", category: user },
    { id: "connections", title: i18n._(msg`Connections`), icon: "game-controller", category: user },
    { id: "connected-apps", title: i18n._(msg`Connected apps`), icon: "key", category: user },
    { id: "my-data", title: i18n._(msg`My data`), icon: "download-simple", category: user },
  ];
  if (gates.billing && FEATHER_ON_PHONE) {
    out.push(
      { id: "plus", title: feather, icon: "seal", category: subscriptions },
      { id: "subscriptions", title: feather, icon: "seal", category: subscriptions, hidden: true },
    );
  }
  out.push(
    { id: "support", title: i18n._(msg`Contact support`), icon: "headset", category: help },
    { id: "feedback", title: feedback, icon: "note-pencil", category: help },
    { id: "reports", title: feedback, icon: "note-pencil", category: help, hidden: true },
    { id: "voice", title: gates.video ? i18n._(msg`Voice & Video`) : i18n._(msg`Voice`), icon: "microphone", category: client },
    { id: "appearance", title: i18n._(msg`Appearance`), icon: "palette", category: client },
    { id: "notifications", title: i18n._(msg`Notifications`), icon: "bell", category: client },
    { id: "data", title: i18n._(msg`Save data`), icon: "cloud-arrow-down", category: client },
    { id: "language", title: i18n._(msg`Language`), icon: "globe", category: client },
  );
  return out;
}

/** The rows of the list, grouped by category in order */
export function userSectionGroups(sections: UserSection[]): [string, UserSection[]][] {
  const map = new Map<string, UserSection[]>();
  for (const s of sections) {
    if (s.hidden) continue;
    map.set(s.category, [...(map.get(s.category) ?? []), s]);
  }
  return [...map.entries()];
}

/** Whether a page id may open (a hidden Feather page needs billing too) */
export function userSectionAllowed(sections: UserSection[], id: string): boolean {
  return sections.some((s) => s.id === id);
}
