/**
 * The app-wide short message with one button (web: useSnackbar with
 * `action`, `closeable`): a notice from the Zrzur team, a reminder that came
 * due, the Save data offer. One shows at a time; a newer one replaces it.
 * Kept apart from the drawing (NoticeSnack.tsx) so tests and any place in
 * the app can show one.
 */
import { useSyncExternalStore } from "react";

export type Snack = {
  id: number;
  message: string;
  /** the button's words */
  action?: string;
  onAction?: () => void;
  /** how long it stays, ms (one with a button stays longer) */
  duration: number;
};

/** How long a message with a button stays (web snackbar with action) */
export const SNACK_ACTION_MS = 10_000;
/** How long a plain message stays */
export const SNACK_PLAIN_MS = 5_000;

let current: Snack | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function showSnack(input: { message: string; action?: string; onAction?: () => void; duration?: number }): number {
  const duration = input.duration ?? (input.action ? SNACK_ACTION_MS : SNACK_PLAIN_MS);
  current = { id: ++counter, message: input.message, action: input.action, onAction: input.onAction, duration };
  if (timer) clearTimeout(timer);
  const id = current.id;
  timer = setTimeout(() => closeSnack(id), duration);
  emit();
  return id;
}

/** Close the message (only the given one, when an id is passed) */
export function closeSnack(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  if (timer) clearTimeout(timer);
  timer = undefined;
  emit();
}

/** Press the message's button: runs it and closes the message */
export function pressSnack() {
  const snack = current;
  closeSnack();
  snack?.onAction?.();
}

export function useSnack(): Snack | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
