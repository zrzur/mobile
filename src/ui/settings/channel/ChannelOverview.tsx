import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { channelChanges, clampUserLimit, formatDuration, formatMegabytes, type RawVoice, roomMakerOf, SLOWMODE, USER_LIMIT_MAX } from "../overrides";
import { ConfirmDialog, ControlRow, InlineError, SaveBar, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { PickerSheet, SelectField } from "../server/controls";
import type { ChannelData } from "./data";

type Picked = { uri: string; name: string; type: string };

/** The literal token of the room name ("{name}" = the member) */
const NAME_TOKEN = "{name}";

/** − value + for the user limit (web: slider 0–50, 0 = no limit) */
function UserLimit({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [picking, setPicking] = useState(false);
  const step = (by: number) => onChange(clampUserLimit(value + by));
  const text = value === 0 ? t`No limit` : t`${value} users`;
  const button = (icon: "minus" | "plus", by: number, a11y: string, off: boolean) => (
    <Pressable
      testID={`user-limit-${icon}`}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled || off}
      onPress={() => step(by)}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.tonalHover : palette.tonal, opacity: disabled || off ? 0.4 : 1 })}
    >
      <Icon name={icon} size={18} color={palette.fg} />
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {label}
      </AText>
      <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: USER_LIMIT_MAX, now: value, text }} style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: disabled ? 0.6 : 1 }}>
        {button("minus", -1, t`Fewer`, value <= 0)}
        <Pressable
          testID="user-limit-value"
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => setPicking(true)}
          style={{ flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.fieldBorder, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
        >
          <AText size={16} line={22} weight="semibold" color={palette.fg}>
            {text}
          </AText>
          <Icon name="caret-down" size={16} color={palette.iconMuted} />
        </Pressable>
        {button("plus", 1, t`More`, value >= USER_LIMIT_MAX)}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <AText size={12} line={16} color={palette.muted}>
          ∞
        </AText>
        <AText size={12} line={16} color={palette.muted}>
          {String(USER_LIMIT_MAX)}
        </AText>
      </View>
      <PickerSheet
        visible={picking}
        title={label}
        value={value}
        onClose={() => setPicking(false)}
        onPick={onChange}
        options={Array.from({ length: USER_LIMIT_MAX + 1 }, (_, n) => ({ value: n, label: n === 0 ? t`No limit` : t`${n} users` }))}
      />
    </View>
  );
}

/** Channel › Overview (web: settings/channel/Overview): one form with Reset / Save */
export function ChannelOverview({ channel, data, onBack }: { channel: Channel; data: ChannelData; onBack: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const canManage = data.manageChannel;

  const [name, setName] = useState(data.name);
  const [description, setDescription] = useState(data.description);
  const [icon, setIcon] = useState<Picked | null | undefined>(undefined);
  const [slowmode, setSlowmode] = useState(data.slowmode);
  const [announcement, setAnnouncement] = useState(data.announcement);
  const [maxUsers, setMaxUsers] = useState(data.maxUsers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [slowPicker, setSlowPicker] = useState(false);
  const [matureDialog, setMatureDialog] = useState(false);

  // room maker fields are not kept by the SDK store: read them from the API
  const [room, setRoom] = useState<{ maker: boolean; roomName: string; temporary: boolean } | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState<string>();
  const [matureAccess, setMatureAccess] = useState<string>("age_unknown");

  useEffect(() => {
    if (!data.voice) return;
    let live = true;
    (client.api.get(`/channels/${channel.id}` as never) as Promise<{ voice?: RawVoice | null }>)
      .then((raw) => {
        if (!live) return;
        const r = roomMakerOf(raw);
        setRoom(r);
        setRoomName(r.roomName);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client, channel, data.voice]);

  useEffect(() => {
    let live = true;
    client.account
      .fetchAge()
      .then((age) => {
        if (live) setMatureAccess((age as { mature_access?: string } | null)?.mature_access ?? "age_unknown");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client]);

  const initial = { name: data.name, description: data.description, slowmode: data.slowmode, announcement: data.announcement, maxUsers: data.maxUsers, roomName: room?.roomName ?? "" };
  const next = { name, description, slowmode, announcement, maxUsers, roomName };
  const changes = channelChanges(initial, next, { voice: data.voice, roomMaker: !!room?.maker });
  const dirty = Object.keys(changes).length > 1 || (changes.remove as string[]).length > 0 || icon !== undefined;

  const reset = () => {
    setName(data.name);
    setDescription(data.description);
    setIcon(undefined);
    setSlowmode(data.slowmode);
    setAnnouncement(data.announcement);
    setMaxUsers(data.maxUsers);
    setRoomName(room?.roomName ?? "");
    setError(undefined);
  };

  const save = async () => {
    if (!name.trim()) return setError(t`Please fill in this field.`);
    setSaving(true);
    setError(undefined);
    try {
      const body = { ...changes, remove: [...(changes.remove as string[])] };
      if (icon === null) body.remove.push("Icon");
      else if (icon) (body as Record<string, unknown>).icon = await client.uploadFile("icons", icon as unknown as File);
      await channel.edit(body as never);
      if (room && roomName.trim() !== room.roomName) setRoom({ ...room, roomName: roomName.trim() });
      setIcon(undefined);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleRoomMaker = async () => {
    if (!room || !canManage) return;
    setRoomBusy(true);
    setRoomError(undefined);
    try {
      await channel.edit({ voice: { maker: !room.maker } } as never);
      setRoom({ ...room, maker: !room.maker });
    } catch (err) {
      setRoomError(describeError(err));
    } finally {
      setRoomBusy(false);
    }
  };

  const pickIcon = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
    if (r.canceled) return;
    const a = r.assets[0];
    setIcon({ uri: a.uri, name: a.fileName ?? "icon.png", type: a.mimeType ?? "image/png" });
  };

  const iconBytes = (client as unknown as { limits?: { file_upload_size_limits?: Record<string, number> } }).limits?.file_upload_size_limits?.icons;
  const size = iconBytes ? formatMegabytes(iconBytes, i18n.locale) : undefined;
  const shownIcon = icon === null ? undefined : icon ? icon.uri : data.icon;
  const slowLabel = (n: number) => (n === 0 ? t`Slowmode off` : formatDuration(n, i18n.locale));
  const showMature = data.mature || matureAccess !== "verification_required";
  // a group uses the web's group wording and has no Mature switch (server channels only)
  const isGroup = data.type === "Group";
  const token = NAME_TOKEN;

  return (
    <SettingsPage title={t`Overview`} backLabel={data.name} onBack={onBack} testID="channel-overview" footer={<SaveBar dirty={dirty} saving={saving} error={error} onReset={reset} onSave={save} />}>
      <SettingsSection title={isGroup ? t`Group` : t`Channel info`}>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable
              testID="channel-icon-pick"
              accessibilityRole="button"
              accessibilityLabel={isGroup ? t`Icon` : t`Change channel icon`}
              onPress={() => void pickIcon()}
              style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.fieldBorder, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
            >
              {shownIcon ? <Image source={{ uri: shownIcon }} style={{ width: 64, height: 64 }} /> : <Icon name={isGroup ? "users-three" : data.voice ? "speaker-high" : "hash"} size={24} color={palette.iconMuted} />}
            </Pressable>
            <View style={{ flex: 1, gap: 8, alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <SmallButton label={isGroup ? t`Change` : t`Change channel icon`} onPress={() => void pickIcon()} />
                {shownIcon ? <SmallButton testID="channel-icon-remove" label={isGroup ? t`Remove` : t`Remove channel icon`} onPress={() => setIcon(null)} /> : null}
              </View>
              {size ? (
                <AText size={12} line={16} color={palette.muted}>
                  {t`Square, up to ${size}`}
                </AText>
              ) : null}
            </View>
          </View>
          <TextField testID="channel-name" label={isGroup ? t`Group name` : t`Channel name`} value={name} onChangeText={setName} maxLength={32} helper={`${[...name].length}/32`} />
          <TextField
            testID="channel-description"
            label={isGroup ? t`Description` : t`Channel description`}
            placeholder={isGroup ? undefined : t`This channel is about...`}
            value={description}
            onChangeText={setDescription}
            maxLength={1024}
            multiline
            helper={`${[...description].length}/1024`}
            style={{ minHeight: 64, textAlignVertical: "top" }}
          />
        </View>
      </SettingsSection>

      {data.type === "TextChannel" && data.voice ? (
        <SettingsSection title={t`Voice`}>
          <View style={{ gap: 12 }}>
            <UserLimit label={t`User limit`} value={maxUsers} onChange={setMaxUsers} disabled={!canManage} />
            <AText size={13} line={18} color={palette.muted}>
              {t`Slide all the way left for no limit. Lowering the limit does not disconnect anyone.`}
            </AText>
            {room && !data.stage && !room.temporary ? (
              <RowGroup>
                <ControlRow
                  first
                  icon="speaker-plus"
                  title={t`Room maker`}
                  description={t`Whoever joins this channel gets a voice room of their own next to it. The room is removed when everyone has left it.`}
                  control={<Toggle testID="room-maker-switch" label={t`Room maker`} value={room.maker} disabled={!canManage || roomBusy} onChange={() => void toggleRoomMaker()} />}
                />
                {roomError ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <InlineError message={roomError} />
                  </View>
                ) : null}
              </RowGroup>
            ) : null}
            {room?.maker ? (
              <View style={{ gap: 8 }}>
                <TextField testID="room-name" label={t`Name of the rooms`} placeholder={NAME_TOKEN} value={roomName} onChangeText={setRoomName} maxLength={32} helper={`${[...roomName].length}/32`} />
                <AText size={13} line={18} color={palette.muted}>
                  {t`${token} stands for the member. Empty: the room carries the member's name alone.`}
                </AText>
              </View>
            ) : null}
          </View>
        </SettingsSection>
      ) : null}

      {data.type === "TextChannel" && !data.voice ? (
        <SettingsSection title={t`Chat`}>
          <View style={{ gap: 12 }}>
            <View style={{ gap: 8 }}>
              <AText size={13} line={20} weight="semibold" color={palette.fg2}>
                {t`Channel slowmode`}
              </AText>
              <SelectField testID="channel-slowmode" label={t`Channel slowmode`} value={slowLabel(slowmode)} onPress={() => setSlowPicker(true)} />
            </View>
            <RowGroup>
              <ControlRow
                first
                icon="megaphone"
                title={t`Announcement channel`}
                description={t`Only people who can manage messages post here. Everyone else reads.`}
                control={<Toggle testID="channel-announcement" label={t`Announcement channel`} value={announcement} onChange={setAnnouncement} />}
              />
            </RowGroup>
          </View>
          <PickerSheet visible={slowPicker} title={t`Channel slowmode`} value={slowmode} onClose={() => setSlowPicker(false)} onPick={setSlowmode} options={SLOWMODE.map((n) => ({ value: n, label: slowLabel(n) }))} />
        </SettingsSection>
      ) : null}

      {isGroup ? null : (
      <SettingsSection title={t`Mark as Mature`}>
        {showMature ? (
          <View style={{ gap: 12, alignItems: "flex-start" }}>
            <AText size={14} line={20} color={palette.fg2}>
              {t`Users will be asked to confirm their age before opening this channel.`}
            </AText>
            <SmallButton testID="channel-mature" label={data.mature ? t`Unmark as Mature` : t`Mark as Mature`} onPress={() => setMatureDialog(true)} />
          </View>
        ) : (
          <AText size={14} line={20} color={palette.fg2}>
            {t`Mature channels are paused: nobody can open mature content until Zrzur offers an age check.`}
          </AText>
        )}
      </SettingsSection>
      )}

      <ConfirmDialog
        visible={matureDialog}
        danger={false}
        title={data.mature ? t`Unmark this channel as mature?` : t`Mark this channel as mature?`}
        text={
          data.mature
            ? t`Users will no longer be asked to confirm their age before joining this channel. Please ensure the content is appropriate for all ages.`
            : t`Users will be asked to confirm their age before joining this channel.`
        }
        confirm={data.mature ? t`Unmark as mature` : t`Mark as mature`}
        cancel={t`Keep as is`}
        onClose={() => setMatureDialog(false)}
        onConfirm={async () => {
          await channel.edit({ nsfw: !data.mature });
        }}
      />
    </SettingsPage>
  );
}
