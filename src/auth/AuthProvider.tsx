import type { Api } from "@zrzur/sdk";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { API_URL } from "@/lib/apiUrl";
import { secureStorage } from "@/lib/secureStorage";
import { clearCache as clearNotificationCache } from "@/notifications/store";
import { forgetRecentPlaces } from "@/ui/find/recentPlaces";

import {
  type AccountStep,
  type LoginResult,
  type MfaMethod,
  createApi,
  logout as logoutRequest,
  nextAccountStep,
  toAuthError,
} from "./flow";
import {
  type Session,
  clearSession,
  loadSession,
  saveSession,
} from "./session";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session; account: AccountStep | "checking" | "offline" };

type AuthContextValue = {
  state: AuthState;
  /** API used by the screens: signed in when there is a session */
  api: Api;
  /** The official API this build talks to */
  apiUrl: string;
  /** Waiting second step after a password login */
  mfa: { ticket: string; methods: MfaMethod[] } | null;
  /** The address a verification email went to */
  pendingEmail: string | null;
  setPendingEmail(email: string | null): void;
  /** Take a login answer: keeps the session, or opens the second step */
  acceptLogin(result: LoginResult): Promise<"done" | "mfa" | "disabled">;
  /** Ask the server where this account stands (username, age, ready) */
  refreshAccount(): Promise<void>;
  /**
   * The live connection was refused: ask the server whether the session
   * still stands (at most once a minute). An ended session signs out and
   * the login screen says "You've been logged out" (web: SignedOut modal).
   */
  checkSession(): void;
  signOut(): Promise<void>;
  /** The session ended on the server (signed out on another device) */
  sessionEnded: boolean;
  dismissSessionEnded(): void;
  /** Close the second step without signing in */
  cancelMfa(): void;
};

/** Least time between two session checks after a refused connection */
const SESSION_CHECK_GAP_MS = 60_000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const apiUrl = API_URL;
  const [mfa, setMfa] = useState<AuthContextValue["mfa"]>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const lastSessionCheck = useRef(0);

  const session = state.status === "signedIn" ? state.session : null;
  const api = useMemo(
    () => (session ? createApi(session.apiUrl, session.token) : createApi(apiUrl)),
    [session, apiUrl],
  );

  const checkAccount = useCallback(async (current: Session) => {
    const signedIn = createApi(current.apiUrl, current.token);
    try {
      const account = await nextAccountStep(signedIn);
      setState({ status: "signedIn", session: current, account });
    } catch (err) {
      const error = toAuthError(err);
      if (error.code === "SessionEnded") {
        // the session was ended elsewhere
        await clearSession(secureStorage);
        setSessionEnded(true);
        setState({ status: "signedOut" });
        return;
      }
      setState({ status: "signedIn", session: current, account: "offline" });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const kept = await loadSession(secureStorage);
      if (!alive) return;
      // a session from another API (a test build) is not used here
      const saved = kept && kept.apiUrl === apiUrl ? kept : null;
      if (!saved) {
        setState({ status: "signedOut" });
        return;
      }
      setState({ status: "signedIn", session: saved, account: "checking" });
      await checkAccount(saved);
    })();
    return () => {
      alive = false;
    };
  }, [checkAccount, apiUrl]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      apiUrl,
      mfa,
      pendingEmail,
      setPendingEmail,
      sessionEnded,
      dismissSessionEnded: () => setSessionEnded(false),
      cancelMfa: () => setMfa(null),
      async acceptLogin(result) {
        if (result.kind === "mfa") {
          setMfa({ ticket: result.ticket, methods: result.methods });
          return "mfa";
        }
        setMfa(null);
        setSessionEnded(false);
        if (result.kind === "disabled") return "disabled";
        await saveSession(secureStorage, result.session);
        setState({ status: "signedIn", session: result.session, account: "checking" });
        await checkAccount(result.session);
        return "done";
      },
      async refreshAccount() {
        if (state.status === "signedIn") await checkAccount(state.session);
      },
      checkSession() {
        if (state.status !== "signedIn") return;
        const now = Date.now();
        if (now - lastSessionCheck.current < SESSION_CHECK_GAP_MS) return;
        lastSessionCheck.current = now;
        void checkAccount(state.session);
      },
      async signOut() {
        if (state.status === "signedIn") {
          await logoutRequest(createApi(state.session.apiUrl, state.session.token));
        }
        await clearSession(secureStorage);
        // the closed-app copy of the mutes and levels belongs to this account
        clearNotificationCache();
        forgetRecentPlaces();
        setMfa(null);
        setState({ status: "signedOut" });
      },
    }),
    [state, api, apiUrl, mfa, pendingEmail, sessionEnded, checkAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
