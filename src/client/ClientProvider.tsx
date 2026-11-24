import { ConnectionState } from "@zrzur/sdk";
import { Client } from "@zrzur/sdk/solid";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import type { Session } from "@/auth/session";
import { type Emitter, useSdkEvent, useSolid } from "@/sdk/bridge";
// before any message is built: keeps the API's system objects (call `missed`)
import "@/sdk/rawSystem";
import { callStore } from "@/voice/call";

import { BACKGROUND_GRACE_MS, configRetryDelay, mayCloseInBackground } from "./connection";

export type LiveStatus = "connecting" | "connected" | "offline";

type ClientValue = {
  client: Client;
  status: LiveStatus;
  /** The gateway was connected at least once with this session */
  everConnected: boolean;
  /** The server config could not be fetched yet (usually: no network) */
  configFailed: boolean;
  /** Try to connect now (the "Reconnect now" link) */
  reconnect: () => void;
};

const ClientContext = createContext<ClientValue | null>(null);

type GatewayStateEvents = { state: [state: ConnectionState] };

/** A client that already carries the session, so the first API calls of child screens are signed in */
function newClient(session: Session): Client {
  const client = new Client({ baseURL: session.apiUrl, autoReconnect: true, syncUnreads: true });
  client.useExistingSession({ _id: session.id, token: session.token, user_id: session.userId });
  return client;
}

/**
 * One SDK client for the signed-in session: keeps servers, channels, users
 * and messages in its own reactive store and the gateway open. Pauses the
 * socket while the app stays in the background (saves battery and data on
 * weak phones) and reconnects when it comes back.
 *
 * - The session goes on the client when it is made, not in an effect:
 *   React runs the children's effects first, and their first API calls
 *   (settings sync, badges, plans …) went out without the session and
 *   came back 401.
 * - A failed config fetch (started without network) is retried with
 *   backoff and on return to the foreground. The SDK keeps a failed config
 *   promise for good, so a retry makes a fresh client.
 * - The socket closes only after a grace period in the background (Android
 *   backgrounds the app for every picker and share sheet), and never
 *   during a call.
 */
export function ClientProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const client = useMemo(
    () => newClient(session),
    // a new session (or a retry after a failed config fetch) is a new client
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.apiUrl, session.token, generation],
  );
  const [state, setState] = useState<ConnectionState>(ConnectionState.Idle);
  const [failed, setFailed] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const attempt = useRef(0);

  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    // development builds only: lets the e2e tests look at the client
    if (__DEV__) (globalThis as { __zrzurClient?: Client }).__zrzurClient = client;

    const retryConfig = () => {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      setGeneration((g) => g + 1);
    };

    client
      .initConfig()
      .then(() => {
        if (!alive) return;
        attempt.current = 0;
        setFailed(false);
        client.connect();
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        // retry only in the foreground; coming back retries at once
        if (AppState.currentState === "active") retryTimer = setTimeout(retryConfig, configRetryDelay(attempt.current++));
      });

    const closeLater = () => {
      clearTimeout(graceTimer);
      graceTimer = setTimeout(function check() {
        if (!alive) return;
        // a call goes on in the background: keep its events, look again later
        if (!mayCloseInBackground(callStore.get().status)) {
          graceTimer = setTimeout(check, BACKGROUND_GRACE_MS);
          return;
        }
        graceTimer = undefined;
        client.events.close();
      }, BACKGROUND_GRACE_MS);
    };

    const sub = AppState.addEventListener("change", (next) => {
      if (!alive) return;
      if (next === "active") {
        clearTimeout(graceTimer);
        graceTimer = undefined;
        if (!client.configured()) {
          attempt.current = 0;
          retryConfig();
          return;
        }
        const now = client.events.state;
        if (now !== ConnectionState.Connected && now !== ConnectionState.Connecting) client.connect();
      } else if (next === "background") {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        if (client.configured()) closeLater();
      }
    });
    return () => {
      alive = false;
      clearTimeout(retryTimer);
      clearTimeout(graceTimer);
      sub.remove();
      client.events.close();
    };
  }, [client]);

  useSdkEvent(client.events as unknown as Emitter<GatewayStateEvents>, "state", setState);
  const ready = useSolid(client.ready);
  const connected = ready && state === ConnectionState.Connected;
  if (connected && !everConnected) setEverConnected(true);

  const status: LiveStatus = connected ? "connected" : failed || state === ConnectionState.Disconnected ? "offline" : "connecting";

  const reconnect = useCallback(() => {
    if (!client.configured()) {
      attempt.current = 0;
      setGeneration((g) => g + 1);
      return;
    }
    const now = client.events.state;
    if (now !== ConnectionState.Connected && now !== ConnectionState.Connecting) client.connect();
  }, [client]);

  const value = useMemo(
    () => ({ client, status, everConnected, configFailed: failed, reconnect }),
    [client, status, everConnected, failed, reconnect],
  );
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const value = useContext(ClientContext);
  if (!value) throw new Error("useClient outside ClientProvider");
  return value.client;
}

export function useLiveStatus(): LiveStatus {
  return useContext(ClientContext)?.status ?? "connecting";
}

/** Everything the connection line needs */
export function useConnection(): Pick<ClientValue, "status" | "everConnected" | "configFailed" | "reconnect"> {
  const value = useContext(ClientContext);
  return value ?? { status: "connecting", everConnected: false, configFailed: false, reconnect: () => undefined };
}
