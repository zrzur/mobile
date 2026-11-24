import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { ReportSheet, type ReportSpec } from "@/ui/profile/ProfileSheet";
import { ConfirmDialog } from "@/ui/settings/parts";
import { ThreadMenuRow } from "@/ui/threads/ThreadChip";

import { canForwardMessage, forwardingEnabled } from "./forward";
import { isKnownSaved, saveMessage, savedRemindersEnabled, unsaveMessage } from "./keep";
import { canEndThisPoll, canRemoveLinkPreviews, EndPollDialog, RemovePreviewsDialog } from "./rich";
import { haptics } from "@/ui/kit/haptics";
import { saveToPhotos, shareFile, shareText } from "@/ui/kit/share";
import { openExternal } from "@/ui/kit/openLink";
import { pickSheetFile, savesToPhotos, type SheetFile } from "@/media/pressedFile";

import { sheetFiles } from "./rich/sheetFiles";
import { MessageApps } from "@/chat/interactions";

/** Run once the sheet has slid away: one modal at a time (iOS drops a modal opened while another closes) */
export function afterSheet(fn: () => void) {
  setTimeout(fn, 280);
}

const QUICK = ["❤️", "😂", "👍", "🔥", "🎉"];

export type MessageSheetActions = {
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  /** Open the full emoji picker to react (the sheet closes first) */
  onReactMore?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onRemind?: (message: Message) => void;
  onMarkUnread?: (message: Message) => void;
  /** Start selection mode with this message */
  onSelect?: (message: Message) => void;
  onToast?: (text: string) => void;
};

/**
 * Long-press on a message (web: MessageContextMenu as a phone sheet):
 * quick reactions and the full picker, Reply / Forward / Copy / Delete,
 * then edit, pin, save, remind me, mark as unread, links and ids, select,
 * the thread row, removing link previews, ending a poll and reporting.
 * Opens one dialog at a time: the sheet closes before anything else opens.
 */
export function MessageSheet({ message, selfId, onClose, ...actions }: { message: Message | null; selfId?: string; onClose: () => void } & MessageSheetActions) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [confirm, setConfirm] = useState<Message | null>(null);
  const [previews, setPreviews] = useState<Message | null>(null);
  const [endPoll, setEndPoll] = useState<Message | null>(null);
  const [report, setReport] = useState<ReportSpec | null>(null);

  const deleteDialog = (
    <>
      {confirm ? (
        <ConfirmDialog
          visible
          title={t`Delete message`}
          text={(confirm.content ?? "").slice(0, 120) || undefined}
          confirm={t`Delete`}
          onConfirm={() => confirm.delete()}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {previews ? <RemovePreviewsDialog message={previews} visible onClose={() => setPreviews(null)} /> : null}
      {endPoll ? <EndPollDialog message={endPoll} visible onClose={() => setEndPoll(null)} /> : null}
      <ReportSheet spec={report} onClose={() => setReport(null)} />
    </>
  );

  if (!message)
    return (
      <>
        <Sheet visible={false} onClose={onClose}>
          {null}
        </Sheet>
        {deleteDialog}
      </>
    );

  const own = !!selfId && message.authorId === selfId;
  const channel = message.channel;
  const canManage = !!channel?.havePermission("ManageMessages");
  const canDelete = own || canManage;
  const canReact = !channel || channel.type === "SavedMessages" || channel.type === "DirectMessage" || channel.type === "Group" || channel.havePermission("React");
  const text = message.content ?? "";
  const canForward = !!actions.onForward && forwardingEnabled(client) && canForwardMessage(message);
  const keep = savedRemindersEnabled(client) && !message.systemMessage;
  const toast = actions.onToast ?? (() => {});
  const saved = isKnownSaved(message.id);

  const close = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const toggleSaved = () =>
    void (saved ? unsaveMessage(client, message.id) : saveMessage(client, message.id))
      .then(() => toast(saved ? t`Removed from saved messages.` : t`Saved. Only you see your saved messages.`))
      .catch((err) => toast(describeError(err)));

  const tile = (id: string, icon: IconName, label: string, onPress: () => void, danger?: boolean) => (
    <Pressable
      key={id}
      testID={`message-sheet-${id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 64,
        paddingHorizontal: 8,
        borderRadius: 14,
        backgroundColor: pressed ? palette.navSelected : palette.field,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      })}
    >
      <Icon name={icon} size={22} color={danger ? palette.danger : palette.iconNeutral} />
      <AText size={12} line={16} weight="medium" color={danger ? palette.danger : palette.fg} numberOfLines={1}>
        {label}
      </AText>
    </Pressable>
  );

  const rows: { id: string; icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [];
  if (own && text) rows.push({ id: "edit", icon: "pencil-simple", label: t`Edit message`, onPress: close(() => actions.onEdit(message)) });
  if (canManage)
    rows.push({ id: "pin", icon: "push-pin", label: message.pinned ? t`Unpin message` : t`Pin message`, onPress: close(() => void (message.pinned ? message.unpin() : message.pin())) });
  if (keep) {
    rows.push({ id: "save", icon: "bookmark-simple", label: saved ? t`Remove from saved` : t`Save message`, onPress: close(toggleSaved) });
    if (actions.onRemind) rows.push({ id: "remind", icon: "clock", label: t`Remind me`, onPress: close(() => actions.onRemind?.(message)) });
  }
  if (actions.onMarkUnread) rows.push({ id: "unread", icon: "eye-slash", label: t`Mark as unread`, onPress: close(() => actions.onMarkUnread?.(message)) });
  const copied = (value: string) => () => {
    void Clipboard.setStringAsync(value);
    haptics.success();
  };
  const link = message.url ?? `https://app.zrzur.com${message.path}`;
  // the message's files; the one held (or the only one) gets the file rows (web: the right-clicked file)
  const files = sheetFiles(message);
  const file = pickSheetFile(message.id, files);
  // photos and videos in the message can be saved to the phone's library
  const media = files.filter(savesToPhotos);
  rows.push({ id: "share", icon: "share-network", label: t`Share`, onPress: close(() => afterSheet(() => void shareText({ message: text || undefined, url: link }))) });
  if (file) {
    const saveFile = async (f: SheetFile) => {
      if (!savesToPhotos(f)) return void (await shareFile(f.url, f.name));
      const result = await saveToPhotos(f.url, f.name);
      if (result === "saved") toast(t`Saved to Photos.`);
      else if (result === "failed") toast(t`Couldn't save. Try again.`);
    };
    rows.push({ id: "open-file", icon: "arrow-square-out", label: t`Open file`, onPress: close(() => void openExternal(file.previewUrl ?? file.url)) });
    rows.push({ id: "save-file", icon: "download-simple", label: t`Save file`, onPress: close(() => afterSheet(() => void saveFile(file))) });
    rows.push({ id: "share-file", icon: "upload-simple", label: t`Share file`, onPress: close(() => afterSheet(() => void shareFile(file.url, file.name))) });
    rows.push({ id: "copy-file-link", icon: "link", label: t`Copy link to file`, onPress: close(copied(file.previewUrl ?? file.url)) });
  }
  // every photo and video at once, when there is more than the one file above
  if (media.length && !(file && media.length === 1))
    rows.push({
      id: "save-photos",
      icon: "download-simple",
      label: t`Save to Photos`,
      onPress: close(() => {
        void (async () => {
          let result: "saved" | "denied" | "failed" = "saved";
          for (const m of media) {
            result = await saveToPhotos(m.url, m.name);
            if (result !== "saved") break;
          }
          if (result === "saved") toast(t`Saved to Photos.`);
          else if (result === "failed") toast(t`Couldn't save. Try again.`);
        })();
      }),
    });
  if (text) rows.push({ id: "copy-text", icon: "copy", label: t`Copy text`, onPress: close(copied(text)) });
  rows.push({
    id: "copy-link",
    icon: "link",
    label: t`Copy message link`,
    onPress: close(copied(link)),
  });
  rows.push({ id: "copy-id", icon: "identification-badge", label: t`Copy message ID`, onPress: close(copied(message.id)) });
  if (canManage && actions.onSelect) rows.push({ id: "select", icon: "check-square", label: t`Select messages`, onPress: close(() => actions.onSelect?.(message)) });
  if (canRemoveLinkPreviews(message))
    rows.push({ id: "remove-previews", icon: "x-circle", label: t`Remove link previews`, onPress: close(() => afterSheet(() => setPreviews(message))), danger: true });
  if (canManage && message.reactions.size > 0)
    rows.push({ id: "remove-reactions", icon: "smiley", label: t`Remove all reactions`, onPress: close(() => void message.clearReactions()), danger: true });
  if (canEndThisPoll(message)) rows.push({ id: "end-poll", icon: "stop", label: t`End poll`, onPress: close(() => afterSheet(() => setEndPoll(message))), danger: true });
  if (!own && !message.systemMessage)
    rows.push({
      id: "report",
      icon: "flag",
      label: t`Report message`,
      onPress: close(() =>
        afterSheet(() =>
          setReport({
            kind: "Message",
            id: message.id,
            serverId: channel?.serverId || undefined,
            label: message.content || message.author?.displayName,
            image: message.author?.animatedAvatarURL,
          }),
        ),
      ),
      danger: true,
    });
  if (!own && file && !message.systemMessage)
    rows.push({
      id: "report-file",
      icon: "flag",
      label: t`Report attachment`,
      onPress: close(() => afterSheet(() => setReport({ kind: "Attachment", id: file.id, messageId: message.id, serverId: channel?.serverId || undefined, label: file.name }))),
      danger: true,
    });

  return (
    <>
      <Sheet visible onClose={onClose} testID="message-sheet">
        {canReact ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            {QUICK.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={emoji}
                onPress={close(() => {
                  haptics.selection();
                  void message.react(emoji);
                })}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: pressed ? palette.navSelected : palette.field,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                })}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
            {actions.onReactMore ? (
            <Pressable
              testID="message-sheet-react-more"
              accessibilityRole="button"
              accessibilityLabel={t`Add reaction`}
              onPress={close(() => actions.onReactMore?.(message))}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, backgroundColor: pressed ? palette.navSelected : palette.field, alignItems: "center", justifyContent: "center" })}
            >
              <Icon name="smiley" size={22} color={palette.iconNeutral} />
            </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tile("reply", "arrow-bend-up-left", t`Reply`, close(() => actions.onReply(message)))}
          {canForward ? tile("forward", "arrow-bend-up-right", t`Forward`, close(() => actions.onForward?.(message))) : null}
          {text ? tile("copy", "copy", t`Copy`, close(() => void Clipboard.setStringAsync(text))) : null}
          {canDelete ? tile("delete", "trash", t`Delete`, close(() => afterSheet(() => setConfirm(message))), true) : null}
        </View>
        {/* the bots' message commands (web: Apps, after the interact group); not on an official account's message */}
        {!message.author?.official ? <MessageApps message={message} onDone={onClose} /> : null}
        <RowGroup>
          {rows.map((r, i) => (
            <GroupRow key={r.id} testID={`message-sheet-${r.id}`} first={i === 0} icon={r.icon} label={r.label} onPress={r.onPress} danger={r.danger} />
          ))}
          <ThreadMenuRow message={message} onClose={onClose} first={rows.length === 0} />
        </RowGroup>
      </Sheet>
      {deleteDialog}
    </>
  );
}
