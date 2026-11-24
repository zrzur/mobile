import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { savedRemindersEnabled } from "@/chat/keep";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { openMyEvents } from "@/ui/events/MyEventsScreen";
import { useBillingAvailable } from "@/ui/inbox/InboxPage";
import { startDesigns } from "@/ui/designs/hooks";
import { eventsEnabled } from "@/ui/server/home";

import { Avatar, presenceColour } from "../Avatar";
import { Icon } from "../Icon";
import { Button } from "../kit/Button";
import { AText } from "../kit/Text";
import { GroupRow, RowGroup, Sheet } from "./parts";

const STATUSES = ["Online", "Idle", "Busy", "Invisible"] as const;

/**
 * The "You" sheet (web: You.tsx, phone design pack of 2026-11-17): the
 * profile on top, then groups of rows with bare icons and the value at
 * the end: Status and Edit status; Friends, My events, Designs, Saved
 * notes, Saved messages, Reminders and Zrzur Feather (each only where the
 * server has it); Settings. A row that leads away closes the sheet.
 */
export function YouSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const billing = useBillingAvailable(client);
  const lists = savedRemindersEnabled(client);
  const events = eventsEnabled(client);
  const [statusOpen, setStatusOpen] = useState(false);
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const me = useFields(self, (u) => ({
    name: u.displayName ?? u.username,
    username: u.username,
    tag: u.discriminator,
    url: u.avatarURL,
    presence: u.presence,
    status: u.status?.text,
  }));
  const friends = useSolid(useCallback(() => client.users.filter((u) => u.relationship === "Friend").length, [client]));

  const label: Record<string, string> = {
    Online: t`Online`,
    Idle: t`Idle`,
    Busy: t`Do not disturb`,
    Invisible: t`Invisible`,
    Focus: t`Focus`,
  };

  const go = (path: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(path);
  };

  return (
    <Sheet visible={visible} onClose={onClose} testID="you-sheet">
      {me ? (
        <View style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar url={me.url} name={me.name} size={64} presence={me.presence as never} />
            <View style={{ flex: 1 }}>
              <AText autoDir size={18} line={24} weight="bold" color={palette.header} numberOfLines={1}>
                {me.name}
              </AText>
              <AText autoDir size={14} line={20} color={palette.muted} numberOfLines={1}>
                {me.username}#{me.tag}
              </AText>
              {me.status ? (
                <AText autoDir size={14} line={20} color={palette.fg2} numberOfLines={2}>
                  {me.status}
                </AText>
              ) : null}
            </View>
          </View>
          <Button testID="you-edit-profile" label={t`Edit profile`} icon="pencil-simple" onPress={() => go("/settings-profile")} fill />
        </View>
      ) : null}

      <RowGroup>
        <GroupRow
          first
          leading={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: presenceColour(palette, me?.presence ?? "Online") }} />}
          label={t`Status`}
          value={label[me?.presence ?? "Online"] ?? t`Online`}
          end={statusOpen ? "caret-up" : "caret-down"}
          onPress={() => setStatusOpen((v) => !v)}
          testID="you-status"
        />
        {statusOpen
          ? STATUSES.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ checked: me?.presence === p }}
                onPress={async () => {
                  setStatusOpen(false);
                  await self?.edit({ status: { ...(self.status ?? {}), presence: p } } as never);
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  // lines up with the row labels: 16 padding + 24 icon slot + 12 gap
                  paddingStart: 16 + 24 + 12,
                  paddingEnd: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: palette.divider,
                  backgroundColor: pressed ? palette.navSelected : "transparent",
                })}
              >
                <AText size={16} line={22} color={palette.fg} style={{ flex: 1 }}>
                  {label[p]}
                </AText>
                {me?.presence === p ? <Icon name="check-circle" size={18} color={palette.accentText} /> : null}
              </Pressable>
            ))
          : null}
        <GroupRow icon="chat-circle" label={t`Edit status`} chevron onPress={() => go("/settings-status")} />
      </RowGroup>

      <RowGroup>
        <GroupRow first icon="users" label={t`Friends`} value={friends ? String(friends) : undefined} chevron onPress={() => go("/friends")} testID="you-friends" />
        {events ? (
          <GroupRow
            icon="calendar"
            label={t`My events`}
            chevron
            testID="you-my-events"
            onPress={() => {
              onClose();
              openMyEvents();
            }}
          />
        ) : null}
        <GroupRow
          icon="palette"
          label={t`Designs`}
          chevron
          testID="you-designs"
          onPress={() => {
            // the wall's first page is asked for while the screen slides in
            startDesigns(client);
            go("/designs" as never);
          }}
        />
        <GroupRow icon="notebook" label={t`Saved notes`} chevron onPress={() => go("/saved-notes")} testID="you-saved" />
        {lists ? <GroupRow icon="bookmark-simple" label={t`Saved messages`} chevron onPress={() => go("/saved")} testID="you-saved-messages" /> : null}
        {lists ? <GroupRow icon="clock" label={t`Reminders`} chevron onPress={() => go("/reminders")} testID="you-reminders" /> : null}
        {billing ? (
          <GroupRow
            icon="sparkle"
            label={t`Zrzur Feather`}
            chevron
            onPress={() => go({ pathname: "/user-settings/[section]", params: { section: "plus" } })}
            testID="you-feather"
          />
        ) : null}
      </RowGroup>

      <RowGroup>
        <GroupRow first icon="gear-six" label={t`Settings`} chevron onPress={() => go("/settings")} testID="you-settings" />
      </RowGroup>
    </Sheet>
  );
}
