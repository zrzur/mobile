import { Api } from "@zrzur/sdk";

import {
  AuthError,
  answerSecurityChange,
  birthMonth,
  confirmAccountDeletion,
  readSecurityChange,
  checkUsername,
  chooseUsername,
  createApi,
  declareAge,
  login,
  logout,
  nextAccountStep,
  parseVerifyCode,
  resendVerification,
  signUp,
  submitMfa,
  toAuthError,
  verifyEmail,
} from "../flow";

const BASE = "https://api.test.zrzur";

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };

/** A fake server: answers by "METHOD /path", records every request */
function fakeServer(
  routes: Record<string, (body: unknown) => { status?: number; body?: unknown } | Error>,
) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({
      method,
      path: url.pathname,
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ type: "NotFound" }), { status: 404 });
    const answer = route(body);
    if (answer instanceof Error) throw answer;
    const status = answer.status ?? 200;
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetcher, api: (token?: string) => createApi(BASE, token, fetcher) };
}

/** A request header, whatever its case */
function header(call: Call, name: string) {
  const key = Object.keys(call.headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? call.headers[key] : undefined;
}

const SUCCESS = {
  result: "Success",
  _id: "S1",
  user_id: "U1",
  token: "tok-123",
  name: "Zrzur for Android (Pixel 8)",
  last_seen: "2026-11-22T10:00:00Z",
};

describe("login", () => {
  it("signs in and keeps the session with the API address", async () => {
    const server = fakeServer({ "POST /auth/session/login": () => ({ body: SUCCESS }) });
    const result = await login(server.api(), {
      email: "  sara@example.com ",
      password: "secret pass",
      friendlyName: "Zrzur for Android (Pixel 8)",
    });
    expect(result).toEqual({
      kind: "success",
      session: { id: "S1", token: "tok-123", userId: "U1", apiUrl: BASE },
    });
    expect(server.calls[0].body).toEqual({
      email: "sara@example.com",
      password: "secret pass",
      friendly_name: "Zrzur for Android (Pixel 8)",
    });
  });

  it("opens the second step when the account has two-factor", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => ({
        body: { result: "MFA", ticket: "T-9", allowed_methods: ["Totp", "Recovery"] },
      }),
    });
    const result = await login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" });
    expect(result).toEqual({ kind: "mfa", ticket: "T-9", methods: ["Totp", "Recovery"] });
  });

  it("reports a disabled account", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => ({ body: { result: "Disabled", user_id: "U1" } }),
    });
    const result = await login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" });
    expect(result).toEqual({ kind: "disabled" });
  });

  it("turns a wrong password into InvalidCredentials", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => ({ status: 401, body: { type: "InvalidCredentials" } }),
    });
    await expect(
      login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "InvalidCredentials" });
  });

  it("asks to confirm the email first when the account is not verified", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => ({ status: 403, body: { type: "UnverifiedAccount" } }),
    });
    await expect(
      login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "UnverifiedAccount" });
  });

  it("says the server cannot be reached when fetch fails", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => new TypeError("Network request failed"),
    });
    await expect(
      login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "Network" });
  });

  it("sends no session header before signing in", async () => {
    const server = fakeServer({ "POST /auth/session/login": () => ({ body: SUCCESS }) });
    await login(server.api(), { email: "a@b.co", password: "x", friendlyName: "n" });
    expect(Object.keys(server.calls[0].headers).map((h) => h.toLowerCase())).not.toContain(
      "x-session-token",
    );
  });
});

describe("second step (MFA)", () => {
  it("sends the app code without spaces, with the ticket", async () => {
    const server = fakeServer({ "POST /auth/session/login": () => ({ body: SUCCESS }) });
    const result = await submitMfa(server.api(), {
      ticket: "T-9",
      method: "Totp",
      value: " 123 456 ",
      friendlyName: "n",
    });
    expect(result.kind).toBe("success");
    expect(server.calls[0].body).toEqual({
      mfa_ticket: "T-9",
      mfa_response: { totp_code: "123456" },
      friendly_name: "n",
    });
  });

  it("sends a recovery code as typed (trimmed)", async () => {
    const server = fakeServer({ "POST /auth/session/login": () => ({ body: SUCCESS }) });
    await submitMfa(server.api(), {
      ticket: "T-9",
      method: "Recovery",
      value: " abcd-efgh ",
      friendlyName: "n",
    });
    expect((server.calls[0].body as { mfa_response: unknown }).mfa_response).toEqual({
      recovery_code: "abcd-efgh",
    });
  });

  it("calls a refused code a wrong code", async () => {
    const server = fakeServer({
      "POST /auth/session/login": () => ({ status: 401, body: { type: "InvalidToken" } }),
    });
    await expect(
      submitMfa(server.api(), { ticket: "T", method: "Totp", value: "000000", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "WrongCode" });
  });
});

describe("sign up and email", () => {
  it("creates the account with the captcha token and no empty invite", async () => {
    const server = fakeServer({ "POST /auth/account/create": () => ({ status: 204 }) });
    await signUp(server.api(), {
      email: " new@example.com",
      password: "long enough",
      captcha: "cap-1",
      invite: "",
    });
    expect(server.calls[0].body).toEqual({
      email: "new@example.com",
      password: "long enough",
      captcha: "cap-1",
    });
  });

  it("reports a failed captcha", async () => {
    const server = fakeServer({
      "POST /auth/account/create": () => ({ status: 400, body: { type: "CaptchaFailed" } }),
    });
    await expect(
      signUp(server.api(), { email: "a@b.co", password: "12345678" }),
    ).rejects.toMatchObject({ code: "CaptchaFailed" });
  });

  it("sends the verification email again", async () => {
    const server = fakeServer({ "POST /auth/account/reverify": () => ({ status: 204 }) });
    await resendVerification(server.api(), { email: "a@b.co ", captcha: "c" });
    expect(server.calls[0].body).toEqual({ email: "a@b.co", captcha: "c" });
  });

  it.each([
    ["https://app.zrzur.com/login/verify/AbC123xyz_-9", "AbC123xyz_-9"],
    ["zrzur://verify/Q1w2E3r4t5", "Q1w2E3r4t5"],
    ["  Q1w2E3r4t5  ", "Q1w2E3r4t5"],
    ["hello", undefined],
    ["", undefined],
    ["https://zrzur.com/", undefined],
  ])("finds the code in %p", (input, code) => {
    expect(parseVerifyCode(input)).toBe(code);
  });

  it("confirms the email and signs in with the ticket the server returns", async () => {
    const server = fakeServer({
      "POST /auth/account/verify/CODE12345": () => ({
        body: { ticket: { token: "mfa-ticket", _id: "x", account_id: "U1", validated: true, authorised: true } },
      }),
      "POST /auth/session/login": () => ({ body: SUCCESS }),
    });
    const result = await verifyEmail(server.api(), { code: "CODE12345", friendlyName: "n" });
    expect(result).toMatchObject({ kind: "success", session: { token: "tok-123" } });
    expect(server.calls[1].body).toEqual({ mfa_ticket: "mfa-ticket", friendly_name: "n" });
  });

  it("confirms without signing in when no ticket comes back", async () => {
    const server = fakeServer({ "POST /auth/account/verify/CODE12345": () => ({ status: 204 }) });
    expect(await verifyEmail(server.api(), { code: "CODE12345", friendlyName: "n" })).toBeNull();
    expect(server.calls).toHaveLength(1);
  });

  it("reports an expired link", async () => {
    const server = fakeServer({
      "POST /auth/account/verify/OLD123456": () => ({ status: 401, body: { type: "InvalidToken" } }),
    });
    await expect(
      verifyEmail(server.api(), { code: "OLD123456", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "InvalidToken" });
  });
});

describe("first entry", () => {
  it("asks for a username when the account has none", async () => {
    const server = fakeServer({ "GET /onboard/hello": () => ({ body: { onboarding: true } }) });
    expect(await nextAccountStep(server.api("tok"))).toEqual({ step: "username" });
    expect(header(server.calls[0], "X-Session-Token")).toBe("tok");
  });

  it("asks for the month and year of birth when the server waits for it", async () => {
    const server = fakeServer({
      "GET /onboard/hello": () => ({ body: { onboarding: false } }),
      "GET /users/@me": () => ({ status: 403, body: { type: "AgeNotDeclared" } }),
    });
    expect(await nextAccountStep(server.api("tok"))).toEqual({ step: "age" });
  });

  it("asks for the age from the account alone, without /users/@me", async () => {
    const server = fakeServer({
      "GET /onboard/hello": () => ({ body: { onboarding: false } }),
      "GET /auth/account/": () => ({ body: { _id: "U1", email: "s@x.test", age: { band: "unknown", mature_access: "age_unknown", can_raise: true } } }),
      "GET /users/@me": () => ({ status: 403, body: { type: "AgeNotDeclared" } }),
    });
    expect(await nextAccountStep(server.api("tok"))).toEqual({ step: "age" });
    expect(server.calls.map((c) => c.path)).not.toContain("/users/@me");
  });

  it("asks for /users/@me only once an age is on record", async () => {
    const server = fakeServer({
      "GET /onboard/hello": () => ({ body: { onboarding: false } }),
      "GET /auth/account/": () => ({ body: { _id: "U1", email: "s@x.test", age: { birth_month: "2000-01", band: "adult", mature_access: "allowed", can_raise: false } } }),
      "GET /users/@me": () => ({ body: { _id: "U1", username: "sara", discriminator: "0001" } }),
    });
    expect(await nextAccountStep(server.api("tok"))).toEqual({ step: "ready", username: "sara", displayName: undefined });
  });

  it("never asks for /users/@me while the username is missing", async () => {
    const server = fakeServer({ "GET /onboard/hello": () => ({ body: { onboarding: true } }) });
    await nextAccountStep(server.api("tok"));
    expect(server.calls.map((c) => c.path)).toEqual(["/onboard/hello"]);
  });

  it("is ready with the username and display name", async () => {
    const server = fakeServer({
      "GET /onboard/hello": () => ({ body: { onboarding: false } }),
      "GET /users/@me": () => ({
        body: { _id: "U1", username: "sara", discriminator: "0001", display_name: "Sara H." },
      }),
    });
    expect(await nextAccountStep(server.api("tok"))).toEqual({
      step: "ready",
      username: "sara",
      displayName: "Sara H.",
    });
  });

  it("reports an ended session", async () => {
    const server = fakeServer({
      "GET /onboard/hello": () => ({ status: 401, body: { type: "InvalidSession" } }),
    });
    await expect(nextAccountStep(server.api("tok"))).rejects.toMatchObject({
      code: "SessionEnded",
    });
  });

  it.each([
    ["sara", "ok"],
    ["s", "short"],
    ["x".repeat(33), "long"],
    ["has space", "chars"],
    ["سارة_1", "ok"],
    ["a.b-c_d", "ok"],
  ])("checks the username %p", (name, verdict) => {
    expect(checkUsername(name)).toBe(verdict);
  });

  it("reports a taken username", async () => {
    const server = fakeServer({
      "POST /onboard/complete": () => ({ status: 409, body: { type: "UsernameTaken" } }),
    });
    await expect(chooseUsername(server.api("tok"), "sara")).rejects.toMatchObject({
      code: "UsernameTaken",
    });
  });

  it("sends only the month and year of birth", async () => {
    const server = fakeServer({
      "PATCH /auth/account/age": () => ({ body: { age: { band: "adult" } } }),
    });
    await declareAge(server.api("tok"), 2001, 3);
    expect(server.calls[0].body).toEqual({ birth_month: "2001-03" });
    expect(birthMonth(1999, 12)).toBe("1999-12");
  });

  it("reports an age below the minimum", async () => {
    const server = fakeServer({
      "PATCH /auth/account/age": () => ({ status: 400, body: { type: "AgeRequirementNotMet" } }),
    });
    await expect(declareAge(server.api("tok"), 2020, 1)).rejects.toMatchObject({
      code: "AgeRequirementNotMet",
    });
  });
});

describe("errors and sign-out", () => {
  it("signs out on the server and never throws", async () => {
    const ok = fakeServer({ "POST /auth/session/logout": () => ({ status: 204 }) });
    await expect(logout(ok.api("tok"))).resolves.toBeUndefined();
    expect(header(ok.calls[0], "X-Session-Token")).toBe("tok");
    const offline = fakeServer({ "POST /auth/session/logout": () => new TypeError("offline") });
    await expect(logout(offline.api("tok"))).resolves.toBeUndefined();
  });

  it("calls a long rate limit RateLimited", async () => {
    const calls: number[] = [];
    const api = new Api({
      baseURL: BASE,
      maxRetries: 0,
      fetch: (async () => {
        calls.push(1);
        return new Response(JSON.stringify({ type: "RateLimited", retry_after: 1 }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    await expect(
      login(api, { email: "a@b.co", password: "x", friendlyName: "n" }),
    ).rejects.toMatchObject({ code: "RateLimited" });
  });

  it("keeps unknown errors as Unknown with the technical text", () => {
    const error = toAuthError(new Error("boom"));
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe("Unknown");
    expect(error.technical).toBe("boom");
  });
});

describe("account links from email", () => {
  it("confirms a deletion with the token", async () => {
    const server = fakeServer({ "PUT /auth/account/delete": () => ({ status: 204 }) });
    await confirmAccountDeletion(server.api(), "del-1");
    expect(server.calls[0]).toMatchObject({ method: "PUT", path: "/auth/account/delete", body: { token: "del-1" } });
  });

  it("reports a deletion link that failed", async () => {
    const server = fakeServer({ "PUT /auth/account/delete": () => ({ status: 401, body: { type: "InvalidToken" } }) });
    await expect(confirmAccountDeletion(server.api(), "x")).rejects.toBeInstanceOf(AuthError);
  });

  it("reads an open change and refuses a used one", async () => {
    const open = fakeServer({ "GET /auth/account/change-request/c1": () => ({ body: { kind: "email", status: "Pending", new_email: "n@x.y", reason: "Asked by you" } }) });
    expect(await readSecurityChange(open.api(), "c1")).toEqual({ state: "open", change: { kind: "email", status: "Pending", new_email: "n@x.y", reason: "Asked by you" } });
    const used = fakeServer({ "GET /auth/account/change-request/c2": () => ({ body: { kind: "email", status: "Accepted" } }) });
    expect(await readSecurityChange(used.api(), "c2")).toEqual({ state: "invalid" });
    const gone = fakeServer({});
    expect(await readSecurityChange(gone.api(), "c3")).toEqual({ state: "invalid" });
  });

  it("answers a change, signed out", async () => {
    const server = fakeServer({ "POST /auth/account/change-request/c1": () => ({ status: 204 }) });
    await answerSecurityChange(server.api(), "c1", false);
    expect(server.calls[0].body).toEqual({ accept: false });
    expect(header(server.calls[0], "x-session-token")).toBeUndefined();
  });
});
