/**
 * Where a message was said, in parts (web: MentionsPanel / InboxEntry
 * `place`): the server and the channel apart, so an Arabic name beside a
 * Latin one keeps its own direction. The words come from the caller, so the
 * function stays free of the i18n runtime.
 */
export type PlaceChannel = {
  type: string;
  name?: string;
  server?: { name: string } | undefined;
};

export function placeParts(channel: PlaceChannel | undefined, words: { directMessage: string; savedNotes: string }): string[] {
  if (!channel) return [];
  if (channel.type === "DirectMessage") return [words.directMessage];
  const name = channel.type === "SavedMessages" ? words.savedNotes : `#${channel.name ?? ""}`;
  return channel.server ? [channel.server.name, name] : [name];
}

/** The first file's name and how many more there are ("file.png", 2) */
export function filesSummary(files: { filename?: string }[] | undefined, fallback: string): { first: string; more: number } | undefined {
  if (!files?.length) return undefined;
  return { first: files[0].filename || fallback, more: files.length - 1 };
}

/** The day group of a mention: today, yesterday or earlier (local days) */
export function dayGroup(date: Date, now = new Date()): "today" | "yesterday" | "earlier" {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : "earlier";
}
