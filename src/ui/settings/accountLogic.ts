/**
 * Pure checks and formatters for My account, the MFA confirmation and the
 * server ownership dialogs (web: user/Account, MFAFlowModal, ServerOwnership,
 * common/lib/userTag).
 */

export type MfaMethod = "Password" | "Totp" | "Recovery";
export type MfaBody = { password: string } | { totp_code: string } | { recovery_code: string };

/** Web: usernames are letters, digits, `_`, `.` and `-` */
export const USERNAME_PATTERN = /^(\p{L}|[\d_.-])+$/u;

/** What is wrong with a typed username, if anything (checked on the trimmed value) */
export function usernameProblem(value: string): "short" | "characters" | undefined {
  const name = value.trim();
  if (name.length < 2) return "short";
  if (!USERNAME_PATTERN.test(name)) return "characters";
  return undefined;
}

/** The web's loose email check: something@something, no spaces */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value.trim());
}

/** Shown instead of the email until it is revealed (and always in streamer mode) */
export const MASKED_EMAIL = "•••••••••••@•••••••••••";

/** Web: a typed server name confirms when it matches, ignoring case and extra spaces */
export function confirmsName(typed: string, name: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const a = norm(typed);
  return a.length > 0 && a === norm(name);
}

/** An account that owns its username carries this tag; older ones keep four digits */
export const UNIQUE_TAG = "0000";

type Named = { username?: string; discriminator?: string } | null | undefined;

/** Whether the account still has a number tag from before unique usernames */
export function hasOldTag(user: Named): boolean {
  return !!user?.discriminator && user.discriminator !== UNIQUE_TAG;
}

/** `#1234` for an old tag, nothing otherwise; `hidden` masks the digits (streamer mode) */
export function userTag(user: Named, hidden = false): string {
  if (!hasOldTag(user)) return "";
  return `#${hidden ? "••••" : user!.discriminator}`;
}

/** What someone types to find the account */
export function userHandle(user: Named, hidden = false): string {
  return `${user?.username ?? ""}${userTag(user, hidden)}`;
}

/** The link an authenticator app reads (web encodes the same in the QR code) */
export function otpauthUri(username: string, secret: string): string {
  return `otpauth://totp/Zrzur:${encodeURIComponent(username)}?secret=${secret}&issuer=Zrzur`;
}

/** One-time codes are sent without spaces */
export function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

/** The request body for PUT /auth/mfa/ticket */
export function mfaBody(method: MfaMethod, value: string): MfaBody {
  switch (method) {
    case "Password":
      return { password: value };
    case "Totp":
      return { totp_code: stripSpaces(value) };
    case "Recovery":
      return { recovery_code: value.trim() };
  }
}

/** The method picked first: never Recovery on its own */
export function firstMethod(methods: readonly MfaMethod[]): MfaMethod | undefined {
  return methods.find((m) => m !== "Recovery");
}

/** `YYYY-MM` for the age endpoint */
export function birthMonthValue(year: string, month: number): string {
  return `${year.padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** `YYYY-MM` back to its parts */
export function parseBirthMonth(value: string | null | undefined): { year: number; month: number } | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return undefined;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  return { year: Number(m[1]), month };
}

/** People aged 16 or 17 (and below the minimum) can only be messaged first by friends */
export function directMessagesFriendsOnly(band: string | undefined): boolean {
  return band === "teen" || band === "under_minimum";
}

/** Ownership can go to a member who is a person and not the owner already */
export function canTransferTo(user: { id: string; bot?: unknown }, ownerId: string): boolean {
  return !user.bot && user.id !== ownerId;
}
