import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { AText, AuthButton, TextField } from "@/ui/auth/parts";
import { type IconName } from "@/ui/Icon";
import { ConfirmDialog, ControlRow, Toggle } from "@/ui/settings/parts";

import { MODAL_GAP, newUlid } from "./ulid";
import { copyToClipboard } from "@/ui/kit/share";
import { editServer } from "@/ui/server/serverEdit";

type CreateKind = "Text" | "Voice" | "Stage" | "Announcement" | "Forum";

/**
 * Create a channel from the server view (web: CreateChannel modal), for
 * people with Manage channel; the same body as Settings, Channels. The new
 * channel opens.
 */
export function CreateChannelSheet({ serverId, category, onClose }: { serverId: string; category?: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const [kind, setKind] = useState<CreateKind>("Text");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const title = useFields(server, (s) => (category && category !== "default" ? s.categories?.find((c) => c.id === category)?.title : undefined), [category]);

  const kinds: { value: CreateKind; title: string; text: string; icon: IconName }[] = [
    { value: "Text", title: t`Text`, text: t`Messages, images, GIFs and links`, icon: "hash" },
    { value: "Voice", title: t`Voice`, text: t`Talk, video and screen sharing`, icon: "speaker-high" },
    { value: "Stage", title: t({ message: "Stage", context: "channel-type" }), text: t`Speakers talk, everyone else listens and can ask to speak.`, icon: "waveform" },
    { value: "Announcement", title: t`Announcement`, text: t`News and updates. Only moderators post, everyone reads.`, icon: "megaphone" },
    { value: "Forum", title: t`Forum`, text: t`Posts with a title and tags; each post has its own conversation.`, icon: "note-pencil" },
  ];

  const create = async () => {
    if (!server) return;
    if (!name.trim()) return setError(t`Please fill in this field.`);
    setBusy(true);
    setError(undefined);
    try {
      const channel = (await server.createChannel({
        type: kind === "Voice" || kind === "Stage" ? "Voice" : kind === "Forum" ? "Forum" : "Text",
        name: name.trim(),
        description: description.trim() || undefined,
        announcement: kind === "Announcement" || undefined,
        voice: kind === "Stage" ? ({ stage: true } as never) : undefined,
        category: category && category !== "default" ? category : undefined,
        private: isPrivate || undefined,
      } as never)) as Channel;
      onClose();
      router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} testID="create-channel">
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {t`Create channel`}
      </AText>
      <AText size={15} line={22} color={palette.fg2}>
        {title ?? t`Channels are where your community talks.`}
      </AText>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`Type`}
      </AText>
      <RowGroup>
        {kinds.map((k, i) => (
          <Pressable key={k.value} testID={`channel-kind-${k.value}`} accessibilityRole="radio" accessibilityState={{ checked: kind === k.value }} onPress={() => setKind(k.value)}>
            <ControlRow
              first={i === 0}
              icon={k.icon}
              title={k.title}
              description={k.text}
              control={
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: kind === k.value ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
                  {kind === k.value ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent }} /> : null}
                </View>
              }
            />
          </Pressable>
        ))}
      </RowGroup>
      <TextField label={t`Channel name`} value={name} onChangeText={setName} maxLength={32} error={error} testID="channel-name" />
      <TextField label={t`Description (optional)`} placeholder={t`What this channel is for`} value={description} onChangeText={setDescription} maxLength={1024} />
      <RowGroup>
        <ControlRow first title={t`Private channel`} description={t`Only you and the roles or members you add can see it.`} control={<Toggle label={t`Private channel`} value={isPrivate} onChange={setPrivate} />} />
      </RowGroup>
      <View style={{ flexDirection: "row" }}>
        <AuthButton status={busy ? "submitting" : "ready"} onPress={create} testID="channel-create">
          {t`Create channel`}
        </AuthButton>
      </View>
    </Sheet>
  );
}

/** Create a category (web: CreateCategory modal) */
export function CreateCategorySheet({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const create = async () => {
    if (!server || !name.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const id = newUlid(Date.now(), Math.random);
      const title = name.trim();
      // built when its turn comes: an edit still on its way is not undone
      await editServer(server, (s) => ({ categories: [...(s.categories ?? []).map((c) => ({ id: c.id, title: c.title, channels: c.channels })), { id, title, channels: [] }] }));
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} testID="create-category">
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {t`Create a new category`}
      </AText>
      <TextField label={t`Name`} value={name} onChangeText={setName} maxLength={32} error={error} testID="category-name" />
      <View style={{ flexDirection: "row" }}>
        <AuthButton status={busy ? "submitting" : "ready"} disabled={!name.trim()} onPress={create} testID="category-create">
          {t`Create`}
        </AuthButton>
      </View>
    </Sheet>
  );
}

/**
 * The menu of a category header (web: CategoryContextMenu), for a long
 * press on it in the channel list. `categoryId` "default" (Text channels /
 * Voice channels) is not a stored category: nothing to set up or delete.
 */
export function CategoryMenu({ serverId, categoryId, onClose }: { serverId: string; categoryId: string; onClose: () => void }) {
  const { t } = useLingui();
  const server = useServer(serverId);
  const [panel, setPanel] = useState<null | "channel" | "category" | "delete">(null);
  const [open, setOpen] = useState(true);
  const f = useFields(
    server,
    (s) => {
      const stored = categoryId !== "default" && !!s.categories?.some((c) => c.id === categoryId);
      const ids = stored ? (s.categories?.find((c) => c.id === categoryId)?.channels ?? []) : [];
      const list = categoryId === "default" ? s.orderedChannels.find((c) => c.id === "default")?.channels.filter(Boolean) ?? [] : ids.map((id) => s.channels.find((c) => c.id === id)).filter((c) => !!c);
      return {
        stored,
        unread: list.some((c) => c!.unread || (c!.mentions?.size ?? 0) > 0),
        manage: s.havePermission("ManageChannel"),
        settings: s.havePermission("ManageChannel") || s.havePermission("ManagePermissions"),
        title: s.categories?.find((c) => c.id === categoryId)?.title ?? "",
      };
    },
    [categoryId],
  );
  if (!server || !f) return null;
  const later = (next: "channel" | "category" | "delete") => {
    setOpen(false);
    setTimeout(() => setPanel(next), Platform.OS === "ios" ? MODAL_GAP : 0);
  };
  const done = () => {
    setPanel(null);
    onClose();
  };
  const markAsRead = () => {
    const list = categoryId === "default" ? (server.orderedChannels.find((c) => c.id === "default")?.channels ?? []) : (server.categories?.find((c) => c.id === categoryId)?.channels ?? []).map((id) => server.channels.find((c) => c.id === id));
    for (const c of list) if (c && (c.unread || c.mentions?.size)) void c.ack().catch(() => undefined);
  };
  const categoryName = f.title;
  return (
    <>
      <Sheet visible={open} onClose={onClose} testID="category-menu">
        {f.unread ? (
          <RowGroup>
            <GroupRow
              first
              icon="check-circle"
              label={t`Mark as read`}
              onPress={() => {
                markAsRead();
                onClose();
              }}
            />
          </RowGroup>
        ) : null}
        {f.manage ? (
          <RowGroup>
            <GroupRow first icon="plus" label={t`Create channel`} testID="category-create-channel" onPress={() => later("channel")} />
            <GroupRow icon="folder-plus" label={t`Create category`} testID="category-create-category" onPress={() => later("category")} />
          </RowGroup>
        ) : null}
        {f.stored && f.settings ? (
          <RowGroup>
            <GroupRow
              first
              icon="gear-six"
              label={t`Category settings`}
              testID={`category-settings-${categoryId}`}
              onPress={() => {
                onClose();
                router.push({ pathname: "/category-settings/[id]/[category]", params: { id: serverId, category: categoryId } });
              }}
            />
            {f.manage ? <GroupRow icon="trash" danger label={t`Delete category`} onPress={() => later("delete")} /> : null}
          </RowGroup>
        ) : null}
        {f.stored ? (
          <RowGroup>
            <GroupRow
              first
              icon="copy"
              label={t`Copy category ID`}
              onPress={() => {
                void copyToClipboard(categoryId);
                onClose();
              }}
            />
          </RowGroup>
        ) : null}
      </Sheet>
      {panel === "channel" ? <CreateChannelSheet serverId={serverId} category={categoryId} onClose={done} /> : null}
      {panel === "category" ? <CreateCategorySheet serverId={serverId} onClose={done} /> : null}
      <ConfirmDialog
        visible={panel === "delete"}
        title={t`Delete category`}
        text={categoryName ? `${categoryName}\n\n${t`Its channels stay, and the same people keep seeing them. Once the category is deleted, there's no going back.`}` : t`Its channels stay, and the same people keep seeing them. Once the category is deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={done}
        onConfirm={async () => {
          await editServer(server, (s) => ({ categories: (s.categories ?? []).filter((c) => c.id !== categoryId).map((c) => ({ id: c.id, title: c.title, channels: c.channels })) }));
        }}
      />
    </>
  );
}
