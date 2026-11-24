/**
 * Which profile is open, and which of its layers shows. One store for the
 * whole app so that any screen can open a profile without props, and so
 * that only one modal is up at a time: the profile, its menu, a moderation
 * step or the report flow replace each other in the same sheet.
 */

export type ProfileLayer =
  | "profile"
  | "menu"
  | "roles"
  | "timeout"
  | "untimeout"
  | "kick"
  | "ban"
  | "banUser"
  | "report"
  | "reportEffect"
  | "identity";

export type ProfileTarget = {
  userId: string;
  serverId?: string;
  layer: ProfileLayer;
  /** where a step returns to when it is cancelled or done ("profile", or nothing: close) */
  back?: "profile" | "menu";
};

let current: ProfileTarget | null = null;
const listeners = new Set<() => void>();

function set(next: ProfileTarget | null) {
  current = next;
  for (const fn of [...listeners]) fn();
}

export const profileStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get: () => current,
};

/** Open a person's profile sheet (from a server: with their roles there) */
export function openProfile(userId: string, serverId?: string) {
  set({ userId, serverId, layer: "profile" });
}

/** Open only the user menu (web: right-click on a user) */
/** Open a person's profile from anywhere (from a server: with their roles there) */
export function useOpenProfile(): (userId: string, serverId?: string) => void {
  return openProfile;
}

export function openUserMenu(userId: string, serverId?: string) {
  set({ userId, serverId, layer: "menu" });
}

/** Go to another layer of the same person; it returns to where it came from */
export function showLayer(layer: ProfileLayer) {
  if (!current) return;
  const back = current.layer === "profile" || current.back === "profile" ? "profile" : undefined;
  set({ ...current, layer, back: layer === "profile" ? undefined : back });
}

/** Leave a step: back to the profile when it came from there, else close */
export function leaveLayer() {
  if (!current) return;
  if (current.layer !== "profile" && current.back === "profile") set({ ...current, layer: "profile", back: undefined });
  else set(null);
}

export function closeProfile() {
  set(null);
}

/** Show a layer for a person: the same sheet when it is open for them, else a new one */
export function openLayer(userId: string, serverId: string | undefined, layer: ProfileLayer) {
  if (current && current.userId === userId) showLayer(layer);
  else set({ userId, serverId, layer });
}
