import type { Channel, Message, Server } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useRef, useState } from "react";

import { type Emitter, useSdkEvent, useSolid } from "@/sdk/bridge";

import { useClient, useLiveStatus } from "./ClientProvider";
import { depsKey, snapshotOf } from "./depsKey";

/**
 * React hooks over the SDK's reactive store. Lists hand out ids (strings
 * compare cheaply, so a list only re-renders when its members change);
 * each row reads its own fields with `useSolid`, so one new message or one
 * unread dot re-renders one row, not the screen. That keeps weak phones fast.
 */

/** Compare string arrays so the snapshot keeps its identity when nothing changed */
function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** A list of ids from the SDK that only changes when the ids do */
function useIds(read: () => string[], deps: unknown[]): string[] {
  const last = useRef<string[]>([]);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const depsId = depsKey(deps);
  const accessor = useCallback(() => {
    const next = readRef.current();
    if (sameIds(last.current, next)) return last.current;
    last.current = next;
    return next;
    // the accessor is rebuilt when the listed dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsId]);
  return useSolid(accessor);
}

/** The signed-in user's id */
export function useSelfId(): string | undefined {
  const client = useClient();
  return useSolid(useCallback(() => (client.ready() ? client.user?.id : undefined), [client]));
}

/** Server ids in the order they were joined */
export function useServerIds(): string[] {
  const client = useClient();
  return useIds(() => client.servers.toList().map((s) => s.id), [client]);
}

export function useServer(id: string | undefined): Server | undefined {
  const client = useClient();
  return useSolid(useCallback(() => (id ? client.servers.get(id) : undefined), [client, id]));
}

export function useChannel(id: string | undefined): Channel | undefined {
  const client = useClient();
  return useSolid(useCallback(() => (id ? client.channels.get(id) : undefined), [client, id]));
}

/**
 * A reactive view of some fields: re-renders only when what `pick` reads
 * changes. `pick` must return primitives (or a stable object).
 */
export function useFields<T, R>(target: T | undefined, pick: (target: T) => R, deps: unknown[] = []): R | undefined {
  const last = useRef<{ snapshot: string; value: R } | null>(null);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  const depsId = depsKey(deps);
  const accessor = useCallback(() => {
    if (!target) return undefined;
    const value = pickRef.current(target);
    const snapshot = snapshotOf(value);
    if (last.current && last.current.snapshot === snapshot) return last.current.value;
    last.current = { snapshot, value };
    return value;
    // rebuilt when the target or the listed dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, depsId]);
  return useSolid(accessor);
}

/** Direct messages and groups, newest activity first */
export function useConversationIds(): string[] {
  const client = useClient();
  return useIds(
    () =>
      client.channels
        .filter((c) => (c.type === "DirectMessage" && c.active) || c.type === "Group")
        .sort((a, b) => (b.lastMessageAt?.getTime() ?? b.createdAt.getTime()) - (a.lastMessageAt?.getTime() ?? a.createdAt.getTime()))
        .map((c) => c.id),
    [client],
  );
}

const PAGE = 50;

type MessageEvents = {
  messageCreate: [message: Message];
  messageDelete: [message: { id: string; channelId: string }];
};

/**
 * Messages of a channel, oldest first. Loads the newest page, then older
 * pages on demand; new messages arrive from the gateway. Keeps at most
 * `limit` messages in memory so long chats don't grow without end.
 */
export function useChannelMessages(channel: Channel | undefined, limit = 400) {
  const client = useClient();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [atStart, setAtStart] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!channel) return;
    let alive = true;
    busy.current = true;
    channel
      .fetchMessagesWithUsers({ limit: PAGE, sort: "Latest" })
      .then(({ messages }) => {
        if (!alive) return;
        const sorted = messages.map((m) => m.id).reverse();
        setIds(sorted);
        setAtStart(messages.length < PAGE);
        setError(null);
      })
      .catch((err) => alive && setError(err))
      .finally(() => {
        busy.current = false;
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [channel]);

  const loadOlder = useCallback(async () => {
    if (!channel || busy.current || atStart || ids.length === 0) return;
    busy.current = true;
    try {
      const { messages } = await channel.fetchMessagesWithUsers({ limit: PAGE, before: ids[0], sort: "Latest" });
      setIds((current) => {
        const older = messages.map((m) => m.id).reverse().filter((id) => !current.includes(id));
        return [...older, ...current];
      });
      if (messages.length < PAGE) setAtStart(true);
    } catch (err) {
      setError(err);
    } finally {
      busy.current = false;
    }
  }, [channel, atStart, ids]);

  // back from the background or a reconnect: fetch what the closed gateway
  // missed (web: history catch-up; mirrors chat/useHistory)
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  });
  const status = useLiveStatus();
  const wasConnected = useRef(status === "connected");
  useEffect(() => {
    const before = wasConnected.current;
    wasConnected.current = status === "connected";
    if (status !== "connected" || before || !channel || busy.current) return;
    const current = idsRef.current;
    let alive = true;
    busy.current = true;
    const latest = () =>
      channel.fetchMessagesWithUsers({ limit: PAGE, sort: "Latest" }).then(({ messages }) => {
        if (!alive) return;
        setIds(messages.map((m) => m.id).reverse());
        setAtStart(messages.length < PAGE);
        setError(null);
      });
    // nothing loaded yet (the first load failed offline): load it again
    const run = !current.length
      ? latest()
      : channel.fetchMessagesWithUsers({ limit: PAGE, after: current[current.length - 1], sort: "Oldest" }).then(({ messages }) => {
          if (!alive) return;
          // a full page means more may be missing: start again from the newest
          if (messages.length >= PAGE) return latest();
          if (!messages.length) return;
          setIds((now) => {
            const next = [...now, ...messages.map((m) => m.id).filter((id) => !now.includes(id))];
            return next.length > limit ? next.slice(next.length - limit) : next;
          });
        });
    run
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      busy.current = false;
    };
  }, [status, channel, limit]);

  const events = client as unknown as Emitter<MessageEvents>;
  useSdkEvent(events, "messageCreate", (message) => {
    if (message.channelId !== channel?.id) return;
    setIds((current) => {
      if (current.includes(message.id)) return current;
      const next = [...current, message.id];
      return next.length > limit ? next.slice(next.length - limit) : next;
    });
  });
  useSdkEvent(events, "messageDelete", (message) => {
    if (message.channelId !== channel?.id) return;
    setIds((current) => current.filter((id) => id !== message.id));
  });

  return { ids, loading, atStart, error, loadOlder };
}
