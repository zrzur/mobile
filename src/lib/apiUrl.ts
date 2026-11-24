/** The official Zrzur API: the app talks to Zrzur's own servers only */
export const DEFAULT_API_URL = "https://api.zrzur.com";

/**
 * The API this build uses. Only a development build (`__DEV__`) may point
 * elsewhere, through `EXPO_PUBLIC_ZRZUR_API` at bundle time (the local test
 * stack); people using the app cannot change it.
 */
export function resolveApiUrl(override: string | undefined, dev: boolean): string {
  if (!dev || !override) return DEFAULT_API_URL;
  return normalizeApiUrl(override) ?? DEFAULT_API_URL;
}

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_ZRZUR_API,
  typeof __DEV__ !== "undefined" && __DEV__,
);

/**
 * Turn what a person typed into an API address: adds `https://` when no
 * scheme is given and drops trailing slashes. Returns `undefined` when it
 * cannot be an address.
 */
export function normalizeApiUrl(input: string): string | undefined {
  let value = input.trim();
  if (!value) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    // a bare local address is plain http, everything else https
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      value,
    );
    value = `${local ? "http" : "https"}://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (!url.hostname) return undefined;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

/** What the app needs from the server's root document (`GET /`) */
export type InstanceConfig = {
  version: string;
  captchaKey?: string;
  email: boolean;
  inviteOnly: boolean;
};

/**
 * Read the server's features. Rejects when the address is not a Zrzur API.
 */
export async function fetchInstanceConfig(
  apiUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<InstanceConfig> {
  const response = await fetcher(`${apiUrl}/`, { method: "GET" });
  if (!response.ok) throw new Error(`NotZrzur: ${response.status}`);
  const body = (await response.json()) as {
    zrzur?: string;
    revolt?: string;
    features?: {
      captcha?: { enabled?: boolean; key?: string };
      email?: boolean;
      invite_only?: boolean;
    };
  };
  const version = body.zrzur ?? body.revolt;
  if (typeof version !== "string" || !body.features) {
    throw new Error("NotZrzur");
  }
  const captcha = body.features.captcha;
  return {
    version,
    captchaKey: captcha?.enabled && captcha.key ? captcha.key : undefined,
    email: body.features.email ?? false,
    inviteOnly: body.features.invite_only ?? false,
  };
}
