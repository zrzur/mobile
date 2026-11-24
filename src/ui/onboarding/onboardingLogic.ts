/**
 * Pure logic of what a member meets when opening a server (web:
 * interestsAsk.ts, AgeGate, client/age.ts). No React, no storage.
 */

/** A role question as far as deciding whether to ask goes */
type Question = { options: { role: string }[] };

/**
 * Whether to open the interests window: the server asks role questions,
 * the member holds none of the roles they give, and they have not skipped
 * or finished the window on this device yet (web: shouldAskInterests).
 */
export function shouldAskInterests(questions: Question[] | undefined, memberRoles: string[], dismissed: boolean): boolean {
  if (dismissed) return false;
  const roles = (questions ?? []).flatMap((q) => q.options.map((o) => o.role));
  if (!roles.length) return false;
  return !roles.some((role) => memberRoles.includes(role));
}

/** Device storage key: the window was skipped or finished for this server (SecureStore keys allow only . - _) */
export const interestsKey = (serverId: string, userId: string) => `zrzur.interests.${serverId}.${userId}`;

/** Whether the server menu offers "Your interests" */
export const hasInterests = (questions: Question[] | undefined) => !!questions?.some((q) => q.options.length);

export type MatureAccess = "allowed" | "age_unknown" | "verification_required" | "minor";

/** The server's answer, unknown until it says otherwise (web: matureAccess) */
export function matureAccess(age: { mature_access?: string } | null | undefined): MatureAccess {
  const value = age?.mature_access;
  return value === "allowed" || value === "verification_required" || value === "minor" ? value : "age_unknown";
}

export type GateState = "open" | MatureAccess | "notice";

/**
 * What a mature channel shows (web: AgeGate): the channel itself, a reason
 * it stays closed, or the notice to press "Enter channel" once.
 */
export function gateState(enabled: boolean, access: MatureAccess, accepted: boolean): GateState {
  if (!enabled) return "open";
  if (access !== "allowed") return access;
  return accepted ? "open" : "notice";
}

/** `YYYY-MM` as the API expects */
export const toBirthMonth = (year: number, month: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
