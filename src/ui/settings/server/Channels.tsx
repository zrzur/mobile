import { useLingui } from "@lingui/react/macro";
import type { Channel, Server } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { Button } from "@/ui/kit";
import { channelIcon } from "@/ui/app/ServerPanel";
import { AText, TextField } from "@/ui/auth/parts";
import { describeError } from "@/auth/errorText";
import { Icon, type IconName } from "@/ui/Icon";

import { ConfirmDialog, ControlRow, SettingsPage, SettingsSection, Toggle } from "../parts";
import { EmptyCard, PickerSheet, RadioDot, RowTool as Tool, SelectPill } from "./controls";
import { editServer } from "@/ui/server/serverEdit";

const SLOWMODE = [0, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 21600];
const ROOM = [0, 2, 3, 4, 5, 8, 10, 15, 20, 25];

function duration(seconds: number, locale: string) {
  const unit = seconds >= 3600 ? "hour" : seconds >= 60 ? "minute" : "second";
  const value = unit === "hour" ? seconds / 3600 : unit === "minute" ? seconds / 60 : seconds;
  return new Intl.NumberFormat(locale === "zh-Hans" ? "zh-CN" : locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}

/** Options in a bottom sheet (web: select); it lives in ./controls with the other shared controls */
export { PickerSheet };

function ChannelRow({ channel, first, canManage }: { channel: Channel; first: boolean; canManage: boolean }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const f = useFields(channel, (c) => ({
    name: c.name,
    voice: c.isVoice,
    slowmode: (c as unknown as { slowmode?: number }).slowmode ?? 0,
    max: c.voice?.maxUsers ?? 0,
    description: (c.description ?? "").split("\n")[0],
    mature: c.mature,
    icon: channelIcon(c),
  }));
  const [picker, setPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!f) return null;
  const channelName = f.name;
  const summary = (f.voice ? t`Nobody in the room` : f.description || t`Text channel`) + (f.mature ? ` · ${t`Age-restricted`}` : "");
  const choice = f.voice
    ? f.max === 0
      ? t`No limit`
      : f.max === 1
        ? t`${f.max} person`
        : t`${f.max} people`
    : f.slowmode === 0
      ? t`Slow mode off`
      : t`Slow mode: ${duration(f.slowmode, i18n.locale)}`;
  return (
    <View style={{ paddingVertical: 8, paddingStart: 16, paddingEnd: 4, gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name={f.icon} size={20} color={palette.iconNeutral} />
        <View style={{ flex: 1 }}>
          <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
            {f.name}
          </AText>
          <AText size={13} line={18} color={palette.muted} numberOfLines={1}>
            {summary}
          </AText>
        </View>
        {canManage ? (
          <>
            <Tool icon="gear-six" testID={`channel-settings-${channel.id}`} label={t`Channel settings`} onPress={() => router.push({ pathname: "/channel-settings/[id]", params: { id: channel.id } })} />
            <Tool icon="trash" label={t`Delete channel`} danger onPress={() => setDeleting(true)} />
          </>
        ) : null}
      </View>
      {canManage ? (
        <View style={{ paddingStart: 32 }}>
          <SelectPill label={f.voice ? t`Room size of ${channelName}` : t`Slow mode in ${channelName}`} value={choice} onPress={() => setPicker(true)} />
        </View>
      ) : null}
      {f.voice ? (
        <PickerSheet
          visible={picker}
          title={t`Room size of ${channelName}`}
          value={f.max}
          onClose={() => setPicker(false)}
          onPick={(v) => void channel.edit({ voice: { max_users: v || null } } as never).catch(() => {})}
          options={ROOM.map((n) => ({ value: n, label: n === 0 ? t`No limit` : n === 1 ? t`${n} person` : t`${n} people` }))}
        />
      ) : (
        <PickerSheet
          visible={picker}
          title={t`Slow mode in ${channelName}`}
          value={f.slowmode}
          onClose={() => setPicker(false)}
          onPick={(v) => void channel.edit({ slowmode: v } as never).catch(() => {})}
          options={SLOWMODE.map((n) => ({ value: n, label: n === 0 ? t`Slow mode off` : t`Slow mode: ${duration(n, i18n.locale)}` }))}
        />
      )}
      <ConfirmDialog
        visible={deleting}
        title={t`Delete ${channelName}?`}
        text={t`Once it's deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(false)}
        onConfirm={() => channel.delete()}
      />
    </View>
  );
}

type CreateKind = "Text" | "Voice" | "Stage" | "Announcement" | "Forum";

/** Channels (web: server settings › Channels): applies at once */
export function ChannelsPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const canManage = server.havePermission("ManageChannel");
  const layout = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          server.orderedChannels.map((cat) => ({ id: cat.id, title: cat.title, channels: cat.channels.filter(Boolean).map((c) => c.id) })),
        ),
      [server],
    ),
  );
  const categories = useMemo(() => JSON.parse(layout) as { id: string; title: string; channels: string[] }[], [layout]);
  const stats = useFields(server, (s) => ({
    text: s.channels.filter((c) => !c.isVoice).length,
    voice: s.channels.filter((c) => c.isVoice).length,
    categories: (s.categories ?? []).length,
  }));

  const [creating, setCreating] = useState<{ category?: string } | null>(null);
  const [kind, setKind] = useState<CreateKind>("Text");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [newCategory, setNewCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string>();

  const create = async () => {
    if (!name.trim()) return setError(t`Please fill in this field.`);
    setBusy(true);
    setError(undefined);
    try {
      await server.createChannel({
        type: kind === "Voice" || kind === "Stage" ? "Voice" : kind === "Forum" ? "Forum" : "Text",
        name: name.trim(),
        description: description.trim() || undefined,
        announcement: kind === "Announcement" || undefined,
        voice: kind === "Stage" ? ({ stage: true } as never) : undefined,
        category: creating?.category && creating.category !== "default" ? creating.category : undefined,
        private: isPrivate || undefined,
      } as never);
      setCreating(null);
      setName("");
      setDescription("");
      setPrivate(false);
      setKind("Text");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    setBusy(true);
    setCategoryError(undefined);
    try {
      const id = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const title = categoryName.trim();
      // built when its turn comes: an edit still on its way (a switch on Overview) is not undone
      await editServer(server, (s) => ({ categories: [...(s.categories ?? []).map((c) => ({ id: c.id, title: c.title, channels: c.channels })), { id, title, channels: [] }] }));
      setNewCategory(false);
      setCategoryName("");
    } catch (err) {
      setCategoryError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const kinds: { value: CreateKind; title: string; text: string; icon: IconName }[] = [
    { value: "Text", title: t`Text`, text: t`Messages, images, GIFs and links`, icon: "hash" },
    { value: "Voice", title: t`Voice`, text: t`Talk, video and screen sharing`, icon: "speaker-high" },
    { value: "Stage", title: t`Stage`, text: t`Speakers talk, everyone else listens and can ask to speak.`, icon: "waveform" },
    { value: "Announcement", title: t`Announcement`, text: t`News and updates. Only moderators post, everyone reads.`, icon: "megaphone" },
    { value: "Forum", title: t`Forum`, text: t`Posts with a title and tags; each post has its own conversation.`, icon: "note-pencil" },
  ];

  return (
    <SettingsPage title={t`Channels`} description={t`The channels and their categories.`} testID="server-channels">
      <SettingsSection
        title={t`Text channels`}
        description={t`Every channel by category. Change slow mode and room size here; the gear opens all settings of a channel.`}
      >
        {canManage ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <Button testID="new-category" label={t`New category`} icon="folder-plus" variant="tonal" onPress={() => setNewCategory(true)} />
            <Button testID="new-channel" label={t`New channel`} icon="plus" onPress={() => setCreating({})} />
          </View>
        ) : null}
        {stats ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              [t`Text channels`, stats.text],
              [t`Voice rooms`, stats.voice],
              [t`Categories`, stats.categories],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flexBasis: "40%", flexGrow: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.field, gap: 4 }}>
                <AText size={22} line={28} weight="bold" color={palette.header}>
                  {String(value)}
                </AText>
                <AText size={13} line={18} color={palette.muted}>
                  {String(label)}
                </AText>
              </View>
            ))}
          </View>
        ) : null}
      </SettingsSection>

      {categories.map((cat) => {
        const title = cat.id === "default" ? t`Without category` : cat.title;
        return (
          <SettingsSection
            key={cat.id}
            title={title}
            aside={
              canManage ? (
                <View style={{ flexDirection: "row" }}>
                  <Tool icon="plus" label={t`Add a channel here`} onPress={() => setCreating({ category: cat.id })} />
                  {cat.id !== "default" ? (
                    <Tool
                      icon="gear-six"
                      testID={`category-settings-${cat.id}`}
                      label={t`Category settings`}
                      onPress={() => router.push({ pathname: "/category-settings/[id]/[category]", params: { id: server.id, category: cat.id } })}
                    />
                  ) : null}
                  {cat.id !== "default" ? <Tool icon="trash" label={t`Delete category`} danger onPress={() => setDeletingCategory(cat.id)} /> : null}
                </View>
              ) : undefined
            }
          >
            {cat.channels.length === 0 ? (
              <EmptyCard icon="folder" title={t`No channels yet`} text={t`Use + to add the first one to this category.`} />
            ) : (
              <RowGroup>
                {cat.channels.map((id, i) => {
                  const channel = server.channels.find((c) => c.id === id);
                  return channel ? (
                    <ChannelRow
                      key={id}
                      channel={channel}
                      first={i === 0}
                      canManage={canManage}
                    />
                  ) : null;
                })}
              </RowGroup>
            )}
          </SettingsSection>
        );
      })}

      <Sheet visible={!!creating} onClose={() => setCreating(null)} testID="create-channel">
        <AText size={18} line={26} weight="bold" color={palette.header}>
          {t`Create channel`}
        </AText>
        <AText size={15} line={22} color={palette.fg2}>
          {t`Channels are where your community talks.`}
        </AText>
        <AText size={13} line={20} weight="semibold" color={palette.fg2}>
          {t`Type`}
        </AText>
        <RowGroup>
          {kinds.map((k, i) => (
            <Pressable key={k.value} testID={`channel-kind-${k.value}`} accessibilityRole="radio" accessibilityState={{ checked: kind === k.value }} aria-checked={kind === k.value} onPress={() => setKind(k.value)} style={({ pressed }) => ({ backgroundColor: pressed ? palette.navSelected : "transparent" })}>
              <ControlRow
                first={i === 0}
                icon={k.icon}
                title={k.title}
                description={k.text}
                control={<RadioDot on={kind === k.value} />}
              />
            </Pressable>
          ))}
        </RowGroup>
        <TextField label={t`Channel name`} value={name} onChangeText={setName} maxLength={32} error={error} testID="channel-name" />
        <TextField label={t`Description (optional)`} placeholder={t`What this channel is for`} value={description} onChangeText={setDescription} maxLength={1024} />
        <RowGroup>
          <ControlRow first title={t`Private channel`} description={t`Only you and the roles or members you add can see it.`} control={<Toggle label={t`Private channel`} value={isPrivate} onChange={setPrivate} />} />
        </RowGroup>
        <Button testID="channel-create" label={t`Create channel`} status={busy ? "submitting" : "ready"} onPress={() => void create()} fill />
      </Sheet>

      <Sheet visible={newCategory} onClose={() => setNewCategory(false)}>
        <AText size={18} line={26} weight="bold" color={palette.header}>
          {t`Create a new category`}
        </AText>
        <TextField
          label={t`Name`}
          value={categoryName}
          onChangeText={(v) => {
            setCategoryName(v);
            setCategoryError(undefined);
          }}
          maxLength={32}
          error={categoryError}
          testID="category-name"
        />
        <Button testID="category-create" label={t`Create`} status={busy ? "submitting" : "ready"} disabled={!categoryName.trim()} onPress={() => void addCategory()} fill />
      </Sheet>

      <ConfirmDialog
        visible={!!deletingCategory}
        title={t`Delete category`}
        text={t`Its channels stay, and the same people keep seeing them. Once the category is deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={() => setDeletingCategory(null)}
        onConfirm={async () => {
          await editServer(server, (s) => ({ categories: (s.categories ?? []).filter((c) => c.id !== deletingCategory).map((c) => ({ id: c.id, title: c.title, channels: c.channels })) }));
        }}
      />
    </SettingsPage>
  );
}
