/**
 * Zrzur Assistant's settings service (web: settings/server/assistant/api.ts).
 * The address comes from the build (EXPO_PUBLIC_ZRZUR_ASSISTANT_URL and
 * EXPO_PUBLIC_ZRZUR_ASSISTANT_BOT_ID); without them the page is hidden, as
 * on the web.
 */
import type { Client } from "@zrzur/sdk/solid";
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytes } from "expo-crypto";

import { type AssistantService, base64ToUrl, base64url, codeFrom, resolveAssistant } from "./assistantLogic";

export const ASSISTANT: AssistantService | undefined = resolveAssistant(
  process.env.EXPO_PUBLIC_ZRZUR_ASSISTANT_URL,
  process.env.EXPO_PUBLIC_ZRZUR_ASSISTANT_BOT_ID,
  typeof __DEV__ !== "undefined" && __DEV__,
);

export type FieldType = "bool" | "int" | "channel" | "channels" | "role" | "roles" | "text" | "enum" | "list";

export type Field = { key: string; type: FieldType; min?: number; max?: number; maxItems?: number; options?: (string | number)[] };

export type ModuleMeta = {
  id: string;
  group: string;
  number: number;
  fields: Field[];
  messages: { key: string; defaults: Record<string, string> }[];
};

export type ModuleState = {
  enabled: boolean;
  disabledAt: number | null;
  logChannel: string | null;
  allowRoles: string[];
  allowChannels: string[];
  settings: Record<string, unknown>;
  messages: Record<string, Record<string, string>>;
};

export type Staff = Record<"admin" | "manager" | "moderator" | "support", string[]>;

export type AssistantConfig = {
  global: { language: string; timezone: string; hijri: boolean; staff: Staff; preset: string | null };
  modules: Record<string, ModuleState>;
};

export type AssistantServer = {
  config: AssistantConfig;
  health: { missing: string[]; rolesAbove: string[]; ok: boolean } | null;
  overview: {
    cases: { number: number; action: string; target: string; at: number }[];
    tickets: { number: number; user: string; state: string; opened: number }[];
    changes: { at: number; user: string; what: string }[];
  };
  presets: string[];
};

/** A refusal from the Assistant's service, with its HTTP status */
export class AssistantError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let session: { token: string; until: number } | undefined;

export const isConnected = () => !!session && session.until > Date.now();

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const service = ASSISTANT!;
  const response = await fetch(`${service.url}${path}`, {
    method,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    if (response.status === 401) session = undefined;
    throw new AssistantError(response.status, data?.error ?? "");
  }
  return data as T;
}

/**
 * Sign in to the Assistant's service with the platform's OAuth2 flow (PKCE).
 * It learns who you are and nothing else; the Connect button is the consent,
 * and the app is listed under Connected apps in user settings.
 */
export async function connect(client: Client) {
  const service = ASSISTANT!;
  const verifier = base64url(getRandomBytes(32));
  const challenge = base64ToUrl(await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, { encoding: CryptoEncoding.BASE64 }));
  const state = base64url(getRandomBytes(16));
  const { redirect } = (await client.api.post("/oauth2/authorize" as never, {
    client_id: service.botId,
    redirect_uri: `${service.url}/oauth/callback`,
    response_type: "code",
    scope: "identify",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    approve: true,
  } as never)) as { redirect: string };
  const code = codeFrom(redirect, state);
  if (!code) throw new AssistantError(401, "");
  const answer = await request<{ session: string; expires_in: number }>("POST", "/api/session", { code, verifier });
  session = { token: answer.session, until: Date.now() + answer.expires_in * 1000 };
}

/** Whether this person already agreed, so no button is needed again */
export async function alreadyAuthorized(client: Client) {
  const apps = (await client.api.get("/oauth2/authorized" as never)) as { application?: { _id?: string } | null }[] | null;
  return (apps ?? []).some((app) => app.application?._id === ASSISTANT!.botId);
}

const serverPath = (id: string) => `/api/servers/${id}`;

export const assistantApi = {
  meta: () => request<{ modules: ModuleMeta[] }>("GET", "/api/meta"),
  server: (id: string) => request<AssistantServer>("GET", serverPath(id)),
  patchGlobal: (id: string, patch: Record<string, unknown>) => request<{ config: AssistantConfig }>("PATCH", `${serverPath(id)}/global`, patch),
  patchModule: (id: string, module: string, patch: Partial<ModuleState>) => request<{ config: AssistantConfig }>("PATCH", `${serverPath(id)}/modules/${module}`, patch),
  wizard: (id: string, preset: string) => request<{ config: AssistantConfig }>("POST", `${serverPath(id)}/wizard`, { preset }),
  purgeModule: (id: string, module: string) => request<unknown>("POST", `${serverPath(id)}/modules/${module}/purge`, {}),
};
