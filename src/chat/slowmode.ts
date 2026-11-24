/**
 * Slowmode in the composer (web: CompositionInfo): the channel lets a member
 * send one message every N seconds. After a send the server answers with the
 * wait (`retry_after`, seconds), the SDK keeps it on the channel with the
 * time it arrived; the line above the box counts it down, and people with
 * Bypass Slowmode see "Slowmode immune".
 */
import type { Channel } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useState } from "react";

import { useSolid } from "@/sdk/bridge";

export type SlowmodeEntry = { retry_after: number; receivedAt?: number };

/** Seconds still to wait (0 when free); 100 ms of slack, as the web */
export function slowmodeLeft(entry: SlowmodeEntry | undefined, now: number): number {
  if (!entry) return 0;
  const target = (entry.receivedAt ?? now) + 100 + entry.retry_after * 1000;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** `h:mm:ss` or `m:ss` (web: durationFormat style "digital"); digits stay Latin, as the web counter */
export function digitalTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** The channel's rule split for a sentence: "1 minute 30 seconds" etc. */
export function splitDuration(seconds: number): { hours: number; minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(seconds));
  return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export type SlowmodeState = {
  /** The channel's rule in seconds (0: off) */
  every: number;
  immune: boolean;
  /** Seconds left before this member may send again */
  left: number;
};

/** The channel's slowmode, ticking once a second while a wait runs */
export function useSlowmode(channel: Channel | undefined): SlowmodeState {
  const info = useSolid(
    useCallback(() => {
      if (!channel) return "0|0|";
      const entry = channel.userSlowmode();
      const immune = channel.havePermission("BypassSlowmode");
      return `${channel.slowmode || 0}|${immune ? 1 : 0}|${entry ? `${entry.retry_after}:${entry.receivedAt ?? ""}` : ""}`;
    }, [channel]),
  );
  const [every, immuneFlag, wait] = info.split("|");
  const entry: SlowmodeEntry | undefined = wait
    ? { retry_after: Number(wait.split(":")[0]), receivedAt: wait.split(":")[1] ? Number(wait.split(":")[1]) : undefined }
    : undefined;
  const immune = immuneFlag === "1";
  const [now, setNow] = useState(() => Date.now());
  const left = immune || !Number(every) ? 0 : slowmodeLeft(entry, now);
  useEffect(() => {
    if (!left) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [left, now]);
  // a new wait arrived: start counting from now
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [wait]);
  return { every: Number(every) || 0, immune, left };
}
