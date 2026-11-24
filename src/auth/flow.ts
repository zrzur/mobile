import { Api, ApiError } from "@zrzur/sdk";

import type { Session } from "./session";

/** Ways to answer a second-step (MFA) check */
export type MfaMethod = "Totp" | "Recovery" | "Password";

export type LoginResult =
  | { kind: "success"; session: Session }
  | { kind: "mfa"; ticket: string; methods: MfaMethod[] }
  | { kind: "disabled" };

/** What can go wrong, in words the screens translate */
export type AuthErrorCode =
  | "InvalidCredentials"
  | "WrongCode"
  | "UnverifiedAccount"
  | "LockedOut"
  | "CaptchaFailed"
  | "CompromisedPassword"
  | "ShortPassword"
  | "Blacklisted"
  | "InvalidInvite"
  | "UsernameTaken"
  | "InvalidUsername"
  | "AgeRequirementNotMet"
  | "InvalidToken"
  | "SessionEnded"
  | "Disabled"
  | "RateLimited"
  | "Network"
  | "Unknown";

/** An error the screens can show, with the technical part kept for "Details" */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly technical: string;
  /** The server's error type (`InvalidCredentials`, ...), `Network` or `Unknown` */
  readonly type: string;
  /** The server's error body (FailedValidation details, retry_after, ...) */
  readonly body: Record<string, unknown>;
  readonly retryAfter?: number;
  constructor(
    code: AuthErrorCode,
    technical: string,
    extra: { type?: string; body?: Record<string, unknown>; retryAfter?: number } = {},
  ) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.technical = technical;
    this.type = extra.type ?? code;
    this.body = extra.body ?? {};
    this.retryAfter = extra.retryAfter;
  }
}

const KNOWN: ReadonlySet<string> = new Set([
  "InvalidCredentials",
  "UnverifiedAccount",
  "LockedOut",
  "CaptchaFailed",
  "CompromisedPassword",
  "ShortPassword",
  "Blacklisted",
  "InvalidInvite",
  "UsernameTaken",
  "InvalidUsername",
  "AgeRequirementNotMet",
  "InvalidToken",
  "RateLimited",
]);

/** Turn anything thrown by a request into an {@link AuthError} */
export function toAuthError(err: unknown, context?: "mfa"): AuthError {
  if (err instanceof AuthError) return err;
  if (err instanceof ApiError) {
    let code: AuthErrorCode = "Unknown";
    if (err.status === 429) code = "RateLimited";
    else if (KNOWN.has(err.type)) code = err.type as AuthErrorCode;
    else if (err.type === "MissingInvite") code = "InvalidInvite";
    else if (err.type === "InvalidSession" || err.status === 401) code = "SessionEnded";
    // a wrong one-time code comes back as an invalid token or credentials
    if (
      context === "mfa" &&
      (code === "InvalidToken" || code === "InvalidCredentials")
    ) {
      code = "WrongCode";
    }
    return new AuthError(code, err.message, {
      type: err.type,
      body: err.body,
      retryAfter: err.retryAfter,
    });
  }
  if (err instanceof TypeError) {
    // fetch throws TypeError when the server cannot be reached
    return new AuthError("Network", err.message, { type: "Network" });
  }
  return new AuthError("Unknown", err instanceof Error ? err.message : String(err), {
    type: "Unknown",
  });
}

async function guard<T>(run: () => Promise<T>, context?: "mfa"): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toAuthError(err, context);
  }
}

type LoginResponse =
  | { result: "Success"; _id: string; user_id: string; token: string }
  | { result: "MFA"; ticket: string; allowed_methods: MfaMethod[] }
  | { result: "Disabled"; user_id: string };

function toResult(api: Api, response: LoginResponse): LoginResult {
  switch (response.result) {
    case "Success":
      return {
        kind: "success",
        session: {
          id: response._id,
          token: response.token,
          userId: response.user_id,
          apiUrl: api.baseURL,
        },
      };
    case "MFA":
      return {
        kind: "mfa",
        ticket: response.ticket,
        methods: response.allowed_methods,
      };
    case "Disabled":
      return { kind: "disabled" };
  }
}

/** Sign in with email and password */
export function login(
  api: Api,
  input: { email: string; password: string; friendlyName: string; captcha?: string },
): Promise<LoginResult> {
  return guard(async () => {
    const response = (await api.raw("post", "/auth/session/login", {
      email: input.email.trim(),
      password: input.password,
      friendly_name: input.friendlyName,
      ...(input.captcha ? { captcha: input.captcha } : {}),
    })) as LoginResponse;
    return toResult(api, response);
  });
}

/** Answer the second step with a code from the app, a recovery code or the password */
export function submitMfa(
  api: Api,
  input: {
    ticket: string;
    method: MfaMethod;
    value: string;
    friendlyName: string;
  },
): Promise<LoginResult> {
  const value = input.value.trim();
  const mfa_response =
    input.method === "Totp"
      ? { totp_code: value.replace(/\s+/g, "") }
      : input.method === "Recovery"
        ? { recovery_code: value }
        : { password: input.value };
  return guard(async () => {
    const response = (await api.post("/auth/session/login", {
      mfa_ticket: input.ticket,
      mfa_response,
      friendly_name: input.friendlyName,
    })) as LoginResponse;
    return toResult(api, response);
  }, "mfa");
}

/** Create an account; the server then sends a verification email */
export function signUp(
  api: Api,
  input: { email: string; password: string; captcha?: string; invite?: string },
): Promise<void> {
  return guard(async () => {
    await api.post("/auth/account/create", {
      email: input.email.trim(),
      password: input.password,
      ...(input.captcha ? { captcha: input.captcha } : {}),
      ...(input.invite ? { invite: input.invite.trim() } : {}),
    });
  });
}

/** Send the verification email again */
export function resendVerification(
  api: Api,
  input: { email: string; captcha?: string },
): Promise<void> {
  return guard(async () => {
    await api.post("/auth/account/reverify", {
      email: input.email.trim(),
      ...(input.captcha ? { captcha: input.captcha } : {}),
    });
  });
}

/**
 * Find the verification code in what the person pasted: the link from the
 * email (`…/login/verify/<code>`), an app link (`zrzur://verify/<code>`) or
 * the code itself.
 */
export function parseVerifyCode(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const match = value.match(/verify\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : undefined;
}

/**
 * Confirm the email address. When the server hands back a ticket, the
 * person is signed in straight away.
 */
export function verifyEmail(
  api: Api,
  input: { code: string; friendlyName: string },
): Promise<LoginResult | null> {
  return guard(async () => {
    const response = (await api.post(
      `/auth/account/verify/${encodeURIComponent(input.code)}`,
    )) as { ticket?: { token: string } } | null | undefined;
    const ticket = response?.ticket?.token;
    if (!ticket) return null;
    const login = (await api.post("/auth/session/login", {
      mfa_ticket: ticket,
      friendly_name: input.friendlyName,
    })) as LoginResponse;
    return toResult(api, login);
  });
}

/** Ask for a link to choose a new password */
export function requestPasswordReset(
  api: Api,
  input: { email: string; captcha?: string },
): Promise<void> {
  return guard(async () => {
    await api.raw("post", "/auth/account/reset_password", {
      email: input.email.trim(),
      ...(input.captcha ? { captcha: input.captcha } : {}),
    });
  });
}

/** Set the new password with the token from the email */
export function confirmPasswordReset(
  api: Api,
  input: { token: string; password: string },
): Promise<void> {
  return guard(async () => {
    await api.raw("patch", "/auth/account/reset_password", {
      token: input.token,
      password: input.password,
    });
  });
}

/**
 * The web's verify flow: GET tells whether the account still needs a
 * password; POST confirms (with the password when asked) and may hand back
 * a ticket to sign in with.
 */
export function verifyNeedsPassword(api: Api, token: string): Promise<boolean> {
  return guard(async () => {
    const answer = (await api.raw("get", `/auth/account/verify/${encodeURIComponent(token)}`)) as
      | { needs_password?: boolean }
      | null
      | undefined;
    return !!answer?.needs_password;
  });
}

export function confirmVerify(
  api: Api,
  input: { token: string; password?: string },
): Promise<string | null> {
  return guard(async () => {
    const answer = (await api.raw(
      "post",
      `/auth/account/verify/${encodeURIComponent(input.token)}`,
      input.password ? { password: input.password } : undefined,
    )) as { ticket?: { token: string } } | null | undefined;
    return answer?.ticket?.token ?? null;
  });
}

/**
 * Delete the account with the token from the confirmation email (web:
 * FlowDelete). Works signed out: the token is the proof.
 */
export function confirmAccountDeletion(api: Api, token: string): Promise<void> {
  return guard(async () => {
    await api.raw("put", "/auth/account/delete", { token });
  });
}

/** An email or two-factor change Zrzur support asked for, as the link shows it */
export type SecurityChange = {
  kind: "email" | "two_factor";
  status: string;
  new_email?: string | null;
  reason?: string | null;
};

/** What a confirm-change link leads to: an open change, or nothing to do */
export type ChangeLookup = { state: "open"; change: SecurityChange } | { state: "invalid" };

/** Read the change behind a confirm-change link (web: FlowConfirmChange); signed out, once */
export async function readSecurityChange(api: Api, token: string): Promise<ChangeLookup> {
  try {
    const change = (await api.raw("get", `/auth/account/change-request/${encodeURIComponent(token)}`)) as SecurityChange | null | undefined;
    return change && change.status === "Pending" ? { state: "open", change } : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  }
}

/** Confirm or decline the change */
export function answerSecurityChange(api: Api, token: string, accept: boolean): Promise<void> {
  return guard(async () => {
    await api.raw("post", `/auth/account/change-request/${encodeURIComponent(token)}`, { accept });
  });
}

/** Sign in with a ticket the server handed out (after verifying) */
export function loginWithTicket(
  api: Api,
  input: { ticket: string; friendlyName: string },
): Promise<LoginResult> {
  return guard(async () => {
    const response = (await api.raw("post", "/auth/session/login", {
      mfa_ticket: input.ticket,
      friendly_name: input.friendlyName,
    })) as LoginResponse;
    return toResult(api, response);
  });
}

/** Where a signed-in account goes next */
export type AccountStep =
  | { step: "username" }
  | { step: "age" }
  | { step: "ready"; username: string; displayName?: string };

/**
 * After signing in: a new account picks a username first, then states its
 * month and year of birth, before anything else works. Only a ready account
 * is asked for its user (`/users/@me`).
 */
export function nextAccountStep(api: Api): Promise<AccountStep> {
  return guard(async () => {
    const hello = await api.get("/onboard/hello");
    if (hello.onboarding) return { step: "username" };
    // the account says whether an age is on record: no /users/@me (refused
    // with 403 AgeNotDeclared) before the age step is done. A server without
    // age details falls back to asking /users/@me.
    const account = (await api.get("/auth/account/").catch(() => undefined)) as { age?: { birth_month?: string | null } | null } | undefined;
    if (account?.age && !account.age.birth_month) return { step: "age" };
    try {
      const me = await api.get("/users/@me");
      return {
        step: "ready",
        username: me.username,
        displayName: me.display_name ?? undefined,
      };
    } catch (err) {
      if (err instanceof ApiError && err.type === "AgeNotDeclared") {
        return { step: "age" };
      }
      throw err;
    }
  });
}

/** Usernames: 2–32 characters, letters, numbers, `_`, `.` and `-` */
export function checkUsername(username: string): "ok" | "short" | "long" | "chars" {
  const value = username.trim();
  if (value.length < 2) return "short";
  if (value.length > 32) return "long";
  if (!/^[\p{L}\p{N}_.-]+$/u.test(value)) return "chars";
  return "ok";
}

export function chooseUsername(api: Api, username: string): Promise<void> {
  return guard(async () => {
    await api.post("/onboard/complete", { username: username.trim() });
  });
}

/** `YYYY-MM`, never the day */
export function birthMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function declareAge(api: Api, year: number, month: number): Promise<void> {
  return guard(async () => {
    await api.patch("/auth/account/age", { birth_month: birthMonth(year, month) });
  });
}

/** Sign out on the server; the local session goes whatever happens */
export async function logout(api: Api): Promise<void> {
  try {
    await api.post("/auth/session/logout");
  } catch {
    // already gone or offline: forgetting it here is what matters
  }
}

/** Build an API client for an address, signed in when a token is given */
export function createApi(
  baseURL: string,
  token?: string,
  fetcher?: typeof fetch,
): Api {
  return new Api({
    baseURL,
    ...(token ? { authentication: { session: token } } : {}),
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}
