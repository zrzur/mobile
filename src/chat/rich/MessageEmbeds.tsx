import { useLingui } from "@lingui/react/macro";
import type { Message, MessageEmbed, TextEmbed, WebsiteEmbed } from "@zrzur/sdk/solid";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { ConfirmDialog } from "@/ui/settings/parts";
import { Icon } from "@/ui/Icon";

import { EmbedView, type EmbedActions } from "./Embed";
import { cardDirection, embedKey } from "./embeds";
import { useRoom } from "./parts";

/**
 * Asks before a message's link previews are removed for everyone (web
 * RemoveLinkPreviews). The link stays in the message. Also for the
 * message menu's "Remove link previews" entry.
 */
export function RemovePreviewsDialog({ message, visible, onClose }: { message: Message; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  return (
    <ConfirmDialog
      visible={visible}
      title={t`Remove link previews?`}
      text={t`The previews under this message will be removed for everyone. The link stays in the message.`}
      confirm={t`Remove previews`}
      onConfirm={() => message.removeEmbeds()}
      onClose={onClose}
    />
  );
}

/** One preview with its X: a press on the card shows the X, a second press hides it */
function Removable({ embed, room, onAsk, actions }: { embed: MessageEmbed; room: number; onAsk: () => void; actions: EmbedActions }) {
  const { palette } = useTheme();
  const { t, i18n } = useLingui();
  const [open, setOpen] = useState(false);
  // the X goes to the card's own end: a card in the other direction puts it first
  const card = embed as WebsiteEmbed | TextEmbed;
  const dir = cardDirection([card.title, card.description]);
  const appRtl = i18n.locale === "ar";
  const flipped = !!dir && (dir === "rtl") !== appRtl;
  return (
    <View testID="link-preview" style={{ flexDirection: flipped ? "row-reverse" : "row", alignItems: "flex-start", maxWidth: "100%" }}>
      <Pressable
        onPress={() => setOpen(!open)}
        onLongPress={actions.onLongPress}
        delayLongPress={300}
        accessibilityHint={t`Remove link previews`}
        style={{ flexShrink: 1, minWidth: 0 }}
      >
        <EmbedView embed={embed} room={room} {...actions} />
      </Pressable>
      <View
        pointerEvents={open ? "auto" : "none"}
        style={{ zIndex: 1, marginTop: 6, marginStart: flipped ? 0 : -50, marginEnd: flipped ? -50 : 0, opacity: open ? 1 : 0 }}
      >
        <Pressable
          testID="remove-previews"
          accessibilityRole="button"
          accessibilityLabel={t`Remove link previews`}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
          onPress={() => {
            setOpen(false);
            onAsk();
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.borderSubtle,
            backgroundColor: palette.field,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="x" size={16} color={palette.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A message's embeds (web MessageEmbeds): previews of our own invite and
 * bot links are left out by the caller (`shownEmbeds`); link previews get
 * an X for the author and moderators after a press on the card.
 */
export function MessageEmbeds({
  message,
  embeds,
  canRemove,
  ...actions
}: { message: Message; embeds: readonly MessageEmbed[]; canRemove: boolean } & EmbedActions) {
  const room = useRoom();
  const [asking, setAsking] = useState(false);
  if (!embeds.length) return null;
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {embeds.map((embed, i) =>
        canRemove && embed.type !== "Text" ? (
          <Removable key={embedKey(message.id, embed, i)} embed={embed} room={room} onAsk={() => setAsking(true)} actions={actions} />
        ) : (
          <EmbedView key={embedKey(message.id, embed, i)} embed={embed} room={room} {...actions} />
        ),
      )}
      {canRemove ? <RemovePreviewsDialog message={message} visible={asking} onClose={() => setAsking(false)} /> : null}
    </View>
  );
}
