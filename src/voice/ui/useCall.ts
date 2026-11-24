import type { Channel } from "@zrzur/sdk/solid";
import { useGlobalSearchParams, useSegments } from "expo-router";
import { useEffect, useState } from "react";

import { useChannel, useFields } from "@/client/hooks";

import { callStore } from "../call";
import { callDuration } from "../logic";
import { hasNativeVoice } from "../native";
import { rings } from "../ringing";
import { useStore, useStoreFields } from "../store";
import { callView } from "../view";
import { type CallPhase, callPhase } from "../viewLogic";

/** Whether the open page is this call's own page (/call/<id> or /voice/<id>) */
export function useOnCallPage(channelId: string | undefined) {
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();
  const page = segments[1];
  return !!channelId && (page === "voice" || page === "call") && typeof params.id === "string" && params.id === channelId;
}

/** The open page, for "is this conversation already on screen" */
export function useOpenChannel(): string | undefined {
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();
  return segments[1] === "channel" && typeof params.id === "string" ? params.id : undefined;
}

/** What the call screen for `channelId` shows (see viewLogic.callPhase) */
export function useCallPhase(channelId: string | undefined): CallPhase {
  const s = useStoreFields(callStore, ["status", "channelId", "error", "tiles"] as const);
  const ended = useStore(callView, (v) => (v.channelId === channelId ? v.ended?.kind : undefined));
  const ringing = useStore(rings, (r) => !!channelId && r.outgoing?.channelId === channelId && r.outgoing.ringing.length > 0);
  const dm = useFields(useChannel(channelId), (c) => c.type === "DirectMessage" || c.type === "Group") ?? false;
  return callPhase({
    view: channelId,
    status: s.status,
    callChannel: s.channelId,
    error: s.error,
    available: hasNativeVoice(),
    ringing,
    others: s.tiles.some((tile) => !tile.local),
    dm,
    ended,
  });
}

/** A call's name: the other person in a DM, else the group or channel name */
export function useCallName(channel: Channel | undefined): string {
  return useFields(channel, (c) => (c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? ""))) ?? "";
}

/** "mm:ss" since the call connected, ticking each second while `active` */
export function useCallTimer(active: boolean): string | undefined {
  const startedAt = useStore(callStore, (s) => (s.status === "connected" ? s.startedAt : undefined));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !startedAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, startedAt]);
  return startedAt ? callDuration(now - startedAt) : undefined;
}
