import { ConnectionState } from "@zrzur/sdk";
import { Client } from "@zrzur/sdk/solid";
import { useEffect, useMemo, useState } from "react";

import type { Session } from "@/auth/session";

import { type Emitter, useSdkEvent, useSolid } from "./bridge";

type GatewayStateEvents = { state: [state: ConnectionState] };

export type LiveStatus = "connecting" | "connected" | "offline";

/**
 * The SDK's live client for a signed-in session: connects to the events
 * gateway and reports, through the bridge, whether it is ready.
 */
export function useLiveClient(session: Session) {
  const client = useMemo(
    () => new Client({ baseURL: session.apiUrl, autoReconnect: true }),
    [session.apiUrl],
  );
  const [state, setState] = useState<ConnectionState>(ConnectionState.Idle);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    client.useExistingSession({ _id: session.id, token: session.token, user_id: session.userId });
    client
      .initConfig()
      .then(() => alive && client.connect())
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      client.events.close();
    };
  }, [client, session.id, session.token, session.userId]);

  useSdkEvent(
    client.events as unknown as Emitter<GatewayStateEvents>,
    "state",
    (next) => setState(next),
  );
  const ready = useSolid(client.ready);

  const status: LiveStatus =
    ready && state === ConnectionState.Connected
      ? "connected"
      : failed || state === ConnectionState.Disconnected
        ? "offline"
        : "connecting";

  return { client, status };
}
