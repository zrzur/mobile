/**
 * Pure helpers of the Wings page and the billing plans (web: WingsSettings,
 * client/billing).
 */

export type WingsLevel = {
  level: number;
  supercharges: number;
  server_emoji: number;
  attachments: number;
  voice_bitrate: number;
  video_resolution: number[];
  video_framerate: number;
  vanity_invite?: boolean;
};

export type BillingPlans = { available: boolean; levels: WingsLevel[] };

/** The level after this many Wings, how many more it takes, and the bar width */
export function wingsProgress(levels: WingsLevel[], count: number) {
  const sorted = [...levels].sort((a, b) => a.supercharges - b.supercharges);
  const next = sorted.find((l) => l.supercharges > count);
  return {
    next,
    more: next ? Math.max(0, next.supercharges - count) : 0,
    percent: next && next.supercharges > 0 ? Math.min(100, (count / next.supercharges) * 100) : undefined,
  };
}

/** The first level whose perks hold the custom invite link */
export function vanityLevel(levels: WingsLevel[]): WingsLevel | undefined {
  return [...levels].sort((a, b) => a.level - b.level).find((l) => l.vanity_invite);
}

/** Uploads as whole megabytes */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1e6);
}

export function kbps(bitsPerSecond: number): number {
  return Math.round(bitsPerSecond / 1000);
}

/** "1080p60": the height, "p", the frame rate */
export function streamQuality(resolution: number[], framerate: number): string {
  return `${resolution[1] ?? resolution[0] ?? 0}p${framerate}`;
}
