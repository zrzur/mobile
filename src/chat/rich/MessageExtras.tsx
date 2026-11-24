import type { Message } from "@zrzur/sdk/solid";
import { memo, useCallback } from "react";
import { Platform, View } from "react-native";

import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";

import { canRemoveLinkPreviews, shownEmbeds } from "./embeds";
import { MessageEmbeds } from "./MessageEmbeds";
import { PollCard } from "./PollCard";
import { isAudioTrack, isVoiceAttachment, playableVoiceSrc } from "./voice";
import { VoiceMessage } from "./VoiceMessage";

/**
 * Everything under a message's text and files, in the web's order:
 * voice notes and audio files (drawn here, so the chat's own attachment
 * list leaves out `isAudioAttachment` files), then embeds and link
 * previews, then the poll. Re-renders only when these parts change.
 */
export const MessageExtras = memo(function MessageExtras({
  message,
  onOpenLink,
  onOpenImage,
  onLongPress,
  audio = true,
}: {
  message: Message;
  /** opens a web address through the chat's link warning */
  onOpenLink: (url: string) => void;
  /** opens a picture full screen; without it the address opens */
  onOpenImage?: (image: { url: string; width?: number; height?: number }) => void;
  /** the message's long press (its menu), so it still works over cards */
  onLongPress?: () => void;
  /** false when the chat draws voice notes itself (see VoiceMessage) */
  audio?: boolean;
}) {
  const embeds = useSolid(useCallback(() => message.embeds, [message]));
  const f = useFields(message, (m) => ({
    poll: !!m.poll,
    canRemove: canRemoveLinkPreviews({
      embeds: m.embeds,
      author: m.author ? { self: m.author.relationship === "User" || m.author.self, official: m.author.official } : null,
      channel: m.channel,
    }),
    files: audio
      ? (m.attachments ?? [])
          .filter((a) => isVoiceAttachment(a) || isAudioTrack(a))
          .map((a) => {
            const voice = isVoiceAttachment(a);
            // a voice note: the AAC copy where the phone can't play the recording (web Attachment)
            const url = voice ? playableVoiceSrc(a.originalUrl, { contentType: a.contentType, name: a.filename }, Platform.OS) : a.originalUrl;
            return { id: a.id, url, name: a.filename, size: a.humanReadableSize, voice };
          })
      : [],
  }), [audio]);
  if (!f) return null;

  // our own invite and bot links show their card in the text instead
  const shown = shownEmbeds(embeds);
  if (!f.files.length && !shown.length && !f.poll) return null;

  return (
    <View testID={`message-extras-${message.id}`}>
      {f.files.map((file) =>
        file.voice ? (
          <VoiceMessage key={file.id} src={file.url} onLongPress={onLongPress} />
        ) : (
          <VoiceMessage key={file.id} src={file.url} title={file.name ?? ""} detail={file.size} download={file.url} onOpenLink={onOpenLink} onLongPress={onLongPress} />
        ),
      )}
      {shown.length ? (
        <MessageEmbeds message={message} embeds={shown} canRemove={f.canRemove} onOpenLink={onOpenLink} onOpenImage={onOpenImage} onLongPress={onLongPress} />
      ) : null}
      {f.poll ? <PollCard message={message} onLongPress={onLongPress} /> : null}
    </View>
  );
});
