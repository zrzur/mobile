/**
 * The number on the app icon: every unread mention, plus one for each
 * unread direct message or group without a mention (a message there is
 * meant for you, like a mention). Muted channels never count, the same as
 * the unread dots in the lists. Pure, so it is unit tested.
 *
 * Apple pushes from the server set the icon to the mention count while the
 * app is closed; this count takes over while it is open.
 */
export type BadgeChannel = {
  type: string;
  unread: boolean;
  muted: boolean;
  mentions: number;
};

/** Icons show at most this; the OS cuts longer numbers anyway */
export const BADGE_MAX = 99_999;

export function badgeCount(channels: Iterable<BadgeChannel>): number {
  let total = 0;
  for (const c of channels) {
    if (c.muted || c.type === "SavedMessages") continue;
    if (c.mentions > 0) total += c.mentions;
    else if (c.unread && (c.type === "DirectMessage" || c.type === "Group")) total += 1;
  }
  return Math.min(total, BADGE_MAX);
}
