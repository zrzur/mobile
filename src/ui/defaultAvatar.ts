import { DEFAULT_AVATARS } from "./defaultAvatars.generated";

/**
 * The pack's own choice for an account (web sampleAvatars.ts): FNV-1a over
 * `zrzur-default-v1:<id>`, so the same id gets the same face in every client.
 */
export function defaultAvatarIndex(userId: string): number {
  let hash = 2166136261;
  // ids are ASCII (ULIDs), so each character is its one UTF-8 byte
  const text = `zrzur-default-v1:${userId}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % DEFAULT_AVATARS.length;
}

/**
 * The server's default picture swapped for ours, as the web does
 * (withDefaultAvatar). An address with a query keeps going to the server:
 * `?v=2` is how official accounts get the logo.
 */
export function defaultAvatarXml(url: string | undefined): string | undefined {
  const id = url?.match(/\/users\/([^/?#]+)\/default_avatar$/)?.[1];
  return id ? DEFAULT_AVATARS[defaultAvatarIndex(id)] : undefined;
}
