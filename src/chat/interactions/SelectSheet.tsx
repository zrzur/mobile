import { useLingui } from "@lingui/react/macro";
import type { Client } from "@zrzur/sdk/solid";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { AText, Button, Icon, PressableRow, SearchField, Sheet } from "@/ui/kit";

import { toggleValue } from "./logic";
import type { Component, SelectOption } from "./types";

/** One entry of a menu: a bot's option, or a member, role or channel of the server */
export type MenuOption = { value: string; label: string; description?: string; emoji?: string; avatar?: string; colour?: string; icon?: "hash" | "speaker-high" };

export type SelectComponent = Extract<Component, { type: "StringSelect" | "UserSelect" | "RoleSelect" | "MentionableSelect" | "ChannelSelect" }>;

export const isSelect = (c: Component): c is SelectComponent => ["StringSelect", "UserSelect", "RoleSelect", "MentionableSelect", "ChannelSelect"].includes(c.type);

type ClientLike = Client;

/** The entries a select offers: its own options, or people, roles or channels of the server */
export function menuOptions(client: ClientLike, component: { type: string; options?: SelectOption[]; channel_types?: string[] | null }, serverId?: string): MenuOption[] {
  if (component.type === "StringSelect" || component.type === "RadioGroup" || component.type === "CheckboxGroup") {
    return (component.options ?? []).map((o) => ({ value: o.value, label: o.label, description: o.description, emoji: o.emoji }));
  }
  const server = serverId ? client.servers.get(serverId) : undefined;
  const roles = (): MenuOption[] =>
    server
      ? [...(server.orderedRoles ?? [])].map((r: { id: string; name: string; colour?: string | null }) => ({ value: r.id, label: r.name, colour: r.colour ?? undefined }))
      : [];
  const members = (): MenuOption[] =>
    serverId
      ? client.serverMembers
          .filter((m) => m.id.server === serverId)
          .map((m) => ({ value: m.id.user, label: m.nickname ?? m.user?.displayName ?? m.user?.username ?? m.id.user, avatar: m.avatarURL ?? m.user?.avatarURL }))
      : [];
  const channels = (): MenuOption[] =>
    (server?.channels ?? [])
      .filter((c) => {
        const kinds = component.channel_types ?? [];
        if (!kinds.length) return true;
        return (!c.isVoice && kinds.includes("Text")) || (!!c.isVoice && kinds.includes("Voice"));
      })
      .map((c) => ({ value: c.id, label: c.name ?? "", icon: c.isVoice ? "speaker-high" : "hash" }));
  switch (component.type) {
    case "UserSelect":
      return members();
    case "RoleSelect":
      return roles();
    case "ChannelSelect":
      return channels();
    case "MentionableSelect":
      return [...members(), ...roles()];
    default:
      return [];
  }
}

/** A bot's emoji: a custom one by id shows as its picture, else the text itself */
export function EmojiMark({ emoji, size = 18 }: { emoji: string; size?: number }) {
  const { palette } = useTheme();
  return (
    <AText size={size - 2} line={size + 2} color={palette.fg} accessibilityElementsHidden>
      {/^[0-9A-Z]{26}$/.test(emoji) ? "" : emoji}
    </AText>
  );
}

/**
 * The list a select opens on a phone (web: SelectMenu panel): a sheet with
 * search when the list is long, one tap for a single choice, ticks and
 * "x of y selected" with Confirm (Done in a form) for several.
 */
export function SelectSheet({
  visible,
  title,
  options,
  selected,
  min = 1,
  max = 1,
  inForm,
  onClose,
  onSubmit,
  testID,
}: {
  visible: boolean;
  title: string;
  options: MenuOption[];
  selected: string[];
  min?: number;
  max?: number;
  inForm?: boolean;
  onClose: () => void;
  onSubmit: (values: string[]) => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [chosen, setChosen] = useState(selected);
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setChosen(selected);
      setQuery("");
    }
  }
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q) || o.description?.toLocaleLowerCase().includes(q)) : options;
  }, [options, query]);
  const multi = max > 1;

  return (
    <Sheet visible={visible} onClose={onClose} testID={testID}>
      <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      {options.length > 8 ? <SearchField value={query} onChange={setQuery} placeholder={t`Search`} compact /> : null}
      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        {shown.length === 0 ? (
          <AText size={14} line={20} color={palette.muted} style={{ paddingVertical: 12 }}>
            {t`Nothing found`}
          </AText>
        ) : (
          shown.map((o) => {
            const on = chosen.includes(o.value);
            return (
              <PressableRow
                key={o.value}
                testID={`select-option-${o.value}`}
                accessibilityRole={multi ? "checkbox" : "radio"}
                accessibilityState={{ checked: on }}
                highlight={palette.navSelected}
                onPress={() => {
                  if (!multi) {
                    onSubmit([o.value]);
                    return;
                  }
                  setChosen((list) => toggleValue(list, o.value, max));
                }}
                style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: on ? palette.navSelected : "transparent" }}
              >
                {o.avatar ? <Avatar url={o.avatar} name={o.label} size={24} /> : null}
                {o.colour ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: o.colour }} /> : null}
                {o.icon ? <Icon name={o.icon} size={18} color={palette.iconMuted} /> : null}
                {o.emoji ? <EmojiMark emoji={o.emoji} /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText autoDir size={15} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                    {o.label}
                  </AText>
                  {o.description ? (
                    <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={2}>
                      {o.description}
                    </AText>
                  ) : null}
                </View>
                {on ? <Icon name="check" size={18} color={palette.accentText} /> : null}
              </PressableRow>
            );
          })
        )}
      </ScrollView>
      {multi ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AText size={13} line={18} color={palette.muted} style={{ flex: 1 }}>
            {t`${chosen.length} of ${Number(max)} selected`}
          </AText>
          <Button testID="select-confirm" label={inForm ? t`Done` : t`Confirm`} disabled={chosen.length < min} onPress={() => onSubmit(chosen)} />
        </View>
      ) : null}
    </Sheet>
  );
}
