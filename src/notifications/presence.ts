/**
 * What the open app tells the push handlers: whether the live connection is
 * up (then it shows notifications itself and pushes stay quiet) and which
 * channel is on screen. A closed app starts with nothing here.
 */
export const appPresence: { connected: boolean; viewingChannelId: string | undefined } = {
  connected: false,
  viewingChannelId: undefined,
};
