import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { ControlRow, Toggle } from "@/ui/settings/parts";

import { ROOM_LIMIT_MAX, type RoomInfo, stepLimit } from "../logic";
import { Note, PillButton, SheetTitle } from "./parts";

/**
 * The controls of your own temporary room (web: RoomControlsModal +
 * RoomControlsPanel): name, size, locked, hidden, hand over, guests.
 */
export function RoomControlsSheet({
  channel,
  info,
  visible,
  onClose,
  onChanged,
}: {
  channel: Channel;
  info: RoomInfo;
  visible: boolean;
  onClose: () => void;
  /** Locked, hidden or the owner changed: read the room again */
  onChanged: () => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const fields = useFields(channel, (c) => ({
    name: c.name ?? "",
    limit: c.voice?.maxUsers ?? 0,
    inside: [...c.voiceParticipants.keys()],
    guests: Object.keys(c.memberPermissions ?? {}),
  }));
  const [name, setName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const owner = info.temporaryFor;
  const serverId = channel.serverId;
  const nameOf = (id: string) => client.serverMembers.getByKey({ server: serverId, user: id })?.displayName ?? client.users.get(id)?.displayName ?? client.users.get(id)?.username ?? id;
  const inside = (fields?.inside ?? []).filter((id) => id !== owner && !client.users.get(id)?.bot);
  const guests = (fields?.guests ?? []).filter((id) => id !== owner);
  const limit = fields?.limit ?? 0;
  const shownName = name ?? fields?.name ?? "";

  async function run(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  const api = client.api as unknown as {
    patch(path: string, body: unknown): Promise<unknown>;
    put(path: string): Promise<unknown>;
    delete(path: string): Promise<unknown>;
  };
  const editRoom = (data: { locked?: boolean; hidden?: boolean; owner?: string }) =>
    run(async () => {
      await api.patch(`/channels/${channel.id}/room`, data);
      onChanged();
    });

  const field = {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: palette.field,
    color: palette.fg,
    fontSize: 16,
    fontFamily: fontFamily(i18n.locale),
  };

  return (
    <Sheet visible={visible} onClose={onClose} testID="room-controls-sheet">
      <SheetTitle>{t`Your room`}</SheetTitle>
      <Note>{t`This room is yours while you are in it. It is removed when everyone has left.`}</Note>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          testID="room-name"
          value={shownName}
          onChangeText={setName}
          maxLength={32}
          accessibilityLabel={t`Room name`}
          placeholder={t`Room name`}
          placeholderTextColor={palette.muted}
          style={[field, inputDirStyle(shownName)]}
        />
        <PillButton
          tone="primary"
          label={t`Save`}
          testID="room-rename"
          disabled={pending || !shownName.trim() || shownName.trim() === fields?.name}
          onPress={() =>
            void run(async () => {
              await channel.edit({ name: shownName.trim() });
              setName(null);
            })
          }
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg} style={{ flex: 1 }}>
          {t`People at most`}
        </AText>
        <Step icon="minus" label={t`Fewer people`} testID="room-limit-less" disabled={pending || limit === 0} onPress={() => void run(() => channel.edit({ voice: { max_users: stepLimit(limit, -1) } } as never))} />
        <AText testID="room-limit" accessibilityLiveRegion="polite" size={16} line={22} weight="semibold" color={palette.fg} style={{ minWidth: 72, textAlign: "center" }}>
          {limit ? String(limit) : t`No limit`}
        </AText>
        <Step icon="plus" label={t`More people`} testID="room-limit-more" disabled={pending || limit >= ROOM_LIMIT_MAX} onPress={() => void run(() => channel.edit({ voice: { max_users: stepLimit(limit, 1) } } as never))} />
      </View>

      <RowGroup>
        <ControlRow
          first
          icon="lock-simple"
          title={t`Locked`}
          description={t`Only the people you let in can join. People already inside stay.`}
          control={<Toggle testID="room-lock" label={t`Locked`} value={info.locked} disabled={pending} onChange={(v) => void editRoom({ locked: v })} />}
        />
        <ControlRow
          icon="eye-slash"
          title={t`Hidden`}
          description={t`Only the people you let in can see the room.`}
          control={<Toggle testID="room-hide" label={t`Hidden`} value={info.hidden} disabled={pending} onChange={(v) => void editRoom({ hidden: v })} />}
        />
      </RowGroup>

      {inside.length ? (
        <View style={{ gap: 6 }}>
          <AText size={13} line={18} weight="semibold" color={palette.muted}>
            {t`In the room`}
          </AText>
          {inside.map((id) => (
            <Person key={id} name={nameOf(id)}>
              <PillButton
                label={t`Hand over the room`}
                testID={`room-give-${id}`}
                disabled={pending}
                onPress={() =>
                  void editRoom({ owner: id }).then(() => {
                    onClose();
                  })
                }
              />
            </Person>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 6, paddingBottom: 8 }}>
        <AText size={13} line={18} weight="semibold" color={palette.muted}>
          {t`People you let in`}
        </AText>
        {guests.map((id) => (
          <Person key={id} name={nameOf(id)}>
            <PillButton label={t`Remove`} disabled={pending} testID={`room-guest-remove-${id}`} onPress={() => void run(() => api.delete(`/channels/${channel.id}/room/guests/${id}`))} />
          </Person>
        ))}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            testID="room-find"
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSearched(false);
            }}
            maxLength={32}
            accessibilityLabel={t`Find a member`}
            placeholder={t`Find a member`}
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={[field, inputDirStyle(query)]}
          />
          <PillButton
            label={t`Search`}
            testID="room-search"
            disabled={pending || !query.trim()}
            onPress={() =>
              void run(async () => {
                const server = channel.server;
                if (!server) return;
                const result = await server.queryMembersExperimental(query.trim());
                const taken = new Set([owner, ...guests]);
                setFound(
                  result.members
                    .filter((m) => !taken.has(m.id.user))
                    .slice(0, 5)
                    .map((m) => ({ id: m.id.user, name: m.displayName ?? m.id.user })),
                );
                setSearched(true);
              })
            }
          />
        </View>
        {found.map((person) => (
          <Person key={person.id} name={person.name}>
            <PillButton
              tone="primary"
              label={t`Let in`}
              testID={`room-let-in-${person.id}`}
              disabled={pending}
              onPress={() =>
                void run(async () => {
                  await api.put(`/channels/${channel.id}/room/guests/${person.id}`);
                  setFound((list) => list.filter((one) => one.id !== person.id));
                })
              }
            />
          </Person>
        ))}
        {searched && !found.length ? <Note>{t`Nobody found by that name.`}</Note> : null}
      </View>
      {error ? <Note alert>{error}</Note> : null}
    </Sheet>
  );
}

function Person({ name, children }: { name: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
      <AText autoDir size={15} line={20} weight="medium" color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </AText>
      {children}
    </View>
  );
}

function Step({ icon, label, onPress, disabled, testID }: { icon: "minus" | "plus"; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? palette.tonalHover : palette.tonal,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon name={icon} size={18} color={palette.fg} />
    </Pressable>
  );
}
