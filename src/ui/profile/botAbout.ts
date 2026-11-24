/**
 * A bot's profile sections (web: profiles/botAbout.ts, ProfileBotAbout,
 * ProfileOwner, ProfileCommands): its standing, who made it, its commands.
 */

/** Only ordinary web addresses become links */
export const safeLink = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);

/** How a bot's profile names its maker, if at all */
export type Creator = { kind: "self"; id: string } | { kind: "name"; name: string };

/**
 * Who made a bot, as its profile shows it. The owner sees their own profile
 * there. Anyone else sees the maker's name only when the owner chose to show
 * it (`show_creator`); they never get the owner's account id.
 */
export function creatorShown(
  publicBot: { creator?: { username: string; displayName?: string } } | undefined,
  ownerId: string | undefined,
  selfId: string | undefined,
): Creator | undefined {
  if (ownerId && selfId === ownerId) return { kind: "self", id: ownerId };
  const creator = publicBot?.creator;
  if (creator) return { kind: "name", name: creator.displayName ?? creator.username };
  return undefined;
}

/** The first fact about a bot: a bot Zrzur runs is never called "not verified" */
export function botStanding(official: boolean | undefined, verified: boolean | undefined): "official" | "verified" | "unverified" {
  if (official) return "official";
  return verified ? "verified" : "unverified";
}

type Command = {
  _id: string;
  application_id?: string;
  type?: string;
  name: string;
  name_localizations?: Record<string, string> | null;
  description?: string | null;
  description_localizations?: Record<string, string> | null;
};

/** A localised name or description: the exact language, then its base ("ar" for "ar-EG"), then the default */
export function localized(value: string, localizations: Record<string, string> | null | undefined, locale: string): string {
  if (!localizations) return value;
  return localizations[locale] ?? localizations[locale.split("-")[0]] ?? value;
}

/** Commands shown before "and N more" */
export const SHOWN_COMMANDS = 6;

/** This bot's slash commands, by name, in the reader's language */
export function botCommands(commands: Command[] | undefined, botId: string, locale: string): { id: string; name: string; description: string }[] {
  return (commands ?? [])
    .filter((c) => (c.application_id ?? botId) === botId && (c.type ?? "ChatInput") === "ChatInput")
    .map((c) => ({
      id: c._id,
      name: localized(c.name, c.name_localizations, locale),
      description: localized(c.description ?? "", c.description_localizations, locale),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
