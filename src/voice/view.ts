/**
 * The call screen's own state (outside React, like the call): which call
 * the full screen shows, whether it is minimised to the pill, and whether
 * the conversation sheet is open over it. Rules in viewLogic.ts.
 */
import { callStore } from "./call";
import { createStore } from "./store";
import { type CallAsk, type CallView, ENDED_MS, NO_VIEW, viewOnCallChange } from "./viewLogic";

export const callView = createStore<CallView>(NO_VIEW);

/** "Start a call?" before a new call rings the others (the overlay shows it) */
export const callAsk = createStore<CallAsk | undefined>(undefined);

export function askToCall(channelId: string, video: boolean) {
  callAsk.set({ channelId, video });
}

export function closeCallAsk() {
  callAsk.set(undefined);
}

/** Open the call screen full size for this channel */
export function openCallView(channelId: string) {
  // a call ended a moment ago is over: its closing timer leaves this one alone
  callView.set({ channelId, expanded: true, chat: false });
}

/** Put the call aside: back to the app, the pill stays */
export function minimiseCallView() {
  callView.set((v) => (v.expanded || v.chat ? { ...v, expanded: false, chat: false } : v));
}

/** Back to the full call screen (the pill) */
export function expandCallView(channelId?: string) {
  callView.set((v) => ({ ...v, channelId: channelId ?? v.channelId, expanded: true }));
}

/** The call screen is gone (hang up, the ended state is over, signed out) */
export function closeCallView() {
  callView.set(NO_VIEW);
}

/** Open or close the conversation sheet over the call */
export function setCallChat(open: boolean) {
  callView.set((v) => (v.chat === open ? v : { ...v, chat: open }));
}

let endTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Keep the screen in step with the call: follow a move, show how it ended,
 * then close. Returns the function that stops it (the overlay owns it).
 */
export function followCall(): () => void {
  let prev = callStore.get();
  const stopCall = callStore.subscribe(() => {
    const next = callStore.get();
    const before = callView.get();
    const after = viewOnCallChange(before, prev, next, Date.now());
    prev = next;
    if (after === before) return;
    callView.set(after);
    if (after.ended && !before.ended) {
      clearTimeout(endTimer);
      const at = after.ended.at;
      endTimer = setTimeout(() => {
        // a new call in the meantime keeps the screen
        if (callView.get().ended?.at === at) closeCallView();
      }, ENDED_MS);
    }
  });
  return () => {
    stopCall();
    clearTimeout(endTimer);
  };
}
