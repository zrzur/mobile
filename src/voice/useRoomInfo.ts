import type { Channel } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useState } from "react";

import { useClient } from "@/client/ClientProvider";

import { roomInfoOf, type RoomInfo } from "./logic";

/**
 * The room maker and temporary room fields of a voice channel. The SDK on
 * the phone (2.0.0) does not hydrate them yet, so they are read from the
 * channel itself once and again after a change (`reload`).
 */
export function useRoomInfo(channel: Channel | undefined): { info: RoomInfo | undefined; reload: () => void } {
  const client = useClient();
  const [state, setState] = useState<{ id: string; info: RoomInfo; turn: number } | undefined>();
  const [turn, setTurn] = useState(0);
  const id = channel?.serverId && channel.isVoice ? channel.id : undefined;

  useEffect(() => {
    if (!id) return;
    let live = true;
    (client.api.get(`/channels/${id as ""}` as never) as Promise<unknown>)
      .then((raw) => live && setState({ id, info: roomInfoOf(raw), turn }))
      .catch(() => live && setState({ id, info: roomInfoOf(null), turn }));
    return () => {
      live = false;
    };
  }, [client, id, turn]);

  const reload = useCallback(() => setTurn((n) => n + 1), []);
  return { info: state && state.id === id ? state.info : undefined, reload };
}
