import type { Channel, Message } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useRef, useState } from "react";

import { useClient, useLiveStatus } from "@/client/ClientProvider";
import { type Emitter, useSdkEvent } from "@/sdk/bridge";

import { addLive, addNewer, addOlder, catchUp, emptyWindow, fromLatest, fromNearby, type HistoryWindow, landingId, PAGE, removeId } from "./history";

type MessageEvents = {
  messageCreate: [message: Message];
  messageDelete: [message: { id: string; channelId: string }];
};

const MAX = 400;
const ids = (list: Message[]) => list.map((m) => m.id);

async function fetchPage(channel: Channel, target?: string): Promise<{ win: HistoryWindow; landing?: string }> {
  if (target) {
    const { messages } = await channel.fetchMessagesWithUsers({ nearby: target, limit: PAGE });
    const win = fromNearby(ids(messages), target, PAGE);
    return { win, landing: landingId(win, target) };
  }
  const { messages } = await channel.fetchMessagesWithUsers({ limit: PAGE, sort: "Latest" });
  return { win: fromLatest(ids(messages), PAGE) };
}

/**
 * A channel's history (web: history/controller.ts): the newest page, or
 * the page around one message; older and newer pages on demand; new
 * messages from the gateway while the present is loaded. At most 400
 * messages stay in memory.
 */
export function useHistory(channel: Channel | undefined, around?: string) {
  const client = useClient();
  const [win, setWin] = useState<HistoryWindow>(emptyWindow);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  const winRef = useRef(win);
  useEffect(() => {
    winRef.current = win;
  });

  /** Load the newest page, or the page around `target`; answers the id it lands on */
  const load = useCallback(
    async (target?: string): Promise<string | undefined> => {
      if (!channel) return;
      busy.current = true;
      try {
        const page = await fetchPage(channel, target);
        setWin(page.win);
        setError(null);
        return page.landing;
      } catch (err) {
        setError(err);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [channel],
  );

  // first load: the newest page, or around the message the link points at
  const [landed, setLanded] = useState<string>();
  useEffect(() => {
    if (!channel) return;
    let alive = true;
    busy.current = true;
    fetchPage(channel, around)
      .then((page) => {
        if (!alive) return;
        setWin(page.win);
        setError(null);
        if (page.landing) setLanded(page.landing);
      })
      .catch((err) => alive && setError(err))
      .finally(() => {
        busy.current = false;
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [channel, around]);

  const loadOlder = useCallback(async () => {
    const w = winRef.current;
    if (!channel || busy.current || w.atStart || !w.ids.length) return;
    busy.current = true;
    try {
      const { messages } = await channel.fetchMessagesWithUsers({ limit: PAGE, before: w.ids[0], sort: "Latest" });
      setWin((current) => addOlder(current, ids(messages), PAGE, MAX));
    } catch (err) {
      setError(err);
    } finally {
      busy.current = false;
    }
  }, [channel]);

  const loadNewer = useCallback(async () => {
    const w = winRef.current;
    if (!channel || busy.current || w.atEnd || !w.ids.length) return;
    busy.current = true;
    try {
      const { messages } = await channel.fetchMessagesWithUsers({ limit: PAGE, after: w.ids[w.ids.length - 1], sort: "Oldest" });
      setWin((current) => addNewer(current, ids(messages), PAGE, MAX));
    } catch (err) {
      setError(err);
    } finally {
      busy.current = false;
    }
  }, [channel]);

  /** Show a message: at once when loaded, else after loading around it; answers the id landed on */
  const jumpTo = useCallback(
    async (id: string): Promise<string | undefined> => {
      const w = winRef.current;
      if (w.ids.includes(id)) return id;
      return load(id);
    },
    [load],
  );

  /** Back to the newest messages (reloads when they are not loaded) */
  const present = useCallback(async () => {
    if (winRef.current.atEnd) return;
    await load();
  }, [load]);

  // back from the background or a reconnect: fetch what the closed gateway
  // missed (otherwise the open chat silently lacks those messages)
  const status = useLiveStatus();
  const wasConnected = useRef(status === "connected");
  useEffect(() => {
    const before = wasConnected.current;
    wasConnected.current = status === "connected";
    if (status !== "connected" || before || !channel) return;
    const w = winRef.current;
    if (!w.ids.length) {
      // the first load failed while offline: try it again
      if (!busy.current) void load();
      return;
    }
    if (!w.atEnd || busy.current) return;
    let alive = true;
    busy.current = true;
    channel
      .fetchMessagesWithUsers({ limit: PAGE, after: w.ids[w.ids.length - 1], sort: "Oldest" })
      .then(({ messages }) => {
        if (!alive) return;
        const next = catchUp(winRef.current, ids(messages), PAGE, MAX);
        busy.current = false;
        if (next) setWin(next);
        else void load();
      })
      .catch(() => {
        busy.current = false;
      });
    return () => {
      alive = false;
      busy.current = false;
    };
  }, [status, channel, load]);

  const events = client as unknown as Emitter<MessageEvents>;
  useSdkEvent(events, "messageCreate", (message) => {
    if (message.channelId === channel?.id) setWin((w) => addLive(w, message.id, MAX));
  });
  useSdkEvent(events, "messageDelete", (message) => {
    if (message.channelId === channel?.id) setWin((w) => removeId(w, message.id));
  });

  /** Try again after an error (from a button) */
  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { ids: win.ids, atStart: win.atStart, atEnd: win.atEnd, loading, error, landed, loadOlder, loadNewer, jumpTo, present, reload };
}
