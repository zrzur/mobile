/** The tabs of the channel details screen (web: ChannelDetailsPhone DetailsTab) */
export type DetailsTab = "members" | "media" | "pins" | "threads" | "links" | "files";

export type DetailsChannel = { type: string; isVoice?: boolean; isThread?: boolean; isForum?: boolean };

/** Which tabs a channel has, in order */
export function detailsTabs(channel: DetailsChannel): DetailsTab[] {
  const list: DetailsTab[] = [];
  if (channel.type !== "SavedMessages" && channel.type !== "DirectMessage") list.push("members");
  list.push("media", "pins");
  if (channel.type === "TextChannel" && !channel.isVoice && !channel.isThread && !channel.isForum) list.push("threads");
  list.push("links", "files");
  return list;
}

/** The tab asked for, if this channel has it, else its first tab */
export function pickTab(tabs: readonly DetailsTab[], wanted: string | undefined): DetailsTab {
  return tabs.includes(wanted as DetailsTab) ? (wanted as DetailsTab) : tabs[0];
}

/**
 * The x a horizontal tab strip scrolls to so a tapped tab sits in the middle
 * (web `scrollIntoView({ inline: "center" })`), kept inside the strip.
 */
export function centredScrollX(x: number, width: number, viewport: number, content: number) {
  const most = Math.max(0, content - viewport);
  return Math.min(most, Math.max(0, Math.round(x + width / 2 - viewport / 2)));
}

/**
 * What to hand the strip's scrollTo for a from-the-left `x`. A browser
 * measures a right-to-left strip's scroll from its right edge (0 down to
 * minus the overflow); a phone measures from the left in both directions.
 */
export function stripOffset(x: number, viewport: number, content: number, rtlBrowser: boolean) {
  return rtlBrowser ? x - Math.max(0, content - viewport) : x;
}
