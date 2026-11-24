import type { Message } from "@zrzur/sdk/solid";
import { type ComponentType, memo } from "react";

import { MessageComponentsBlock } from "./interactions/MessageComponents";

/**
 * Extra pieces under a message's text (embeds, polls, voice messages, GIFs,
 * …). Each block decides from the message whether it has anything to draw
 * and returns null otherwise; blocks draw in the order they were added,
 * after the text and before the attachments and reactions.
 *
 *   registerMessageBlock("poll", PollBlock);
 *
 * Register at import time (a module the app loads before the chat, or
 * add the import below). A block must be memoised and read only the
 * fields it needs (useFields), so it costs nothing on rows without one.
 */
export type MessageBlockProps = { message: Message; serverId?: string; selfId?: string };

const blocks: { id: string; Component: ComponentType<MessageBlockProps> }[] = [];

export function registerMessageBlock(id: string, Component: ComponentType<MessageBlockProps>) {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) blocks[at] = { id, Component };
  else blocks.push({ id, Component });
}

/** Where MessageRow draws the registered blocks */
export const MessageBlocks = memo(function MessageBlocks(props: MessageBlockProps) {
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map(({ id, Component }) => (
        <Component key={id} {...props} />
      ))}
    </>
  );
});

// bots' buttons, menus and blocks (row 131); imported here so every chat draws them
registerMessageBlock("components", MessageComponentsBlock);
