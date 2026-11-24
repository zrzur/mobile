import { useLingui } from "@lingui/react/macro";
import type { Server, ServerMember } from "@zrzur/sdk/solid";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, SearchField, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

import { pickableMembers } from "./memberSearch";

/** A member's name as the lists show it */
export function memberName(m: ServerMember): string {
  return m.displayName ?? m.user?.displayName ?? m.user?.username ?? "";
}

/**
 * Search the server's members and pick one, in a bottom sheet (web:
 * MemberPicker with max 1). The members load once, when it first opens.
 */
export function MemberPickerSheet({
  server,
  visible,
  title,
  exclude,
  busy,
  error,
  onPick,
  onClose,
  testID,
}: {
  server: Server;
  visible: boolean;
  title: string;
  /** user ids never offered */
  exclude: (string | undefined)[];
  /** the user id being saved, if any */
  busy?: string;
  /** shown above the list (a refused save) */
  error?: ReactNode;
  onPick: (member: ServerMember) => void;
  onClose: () => void;
  /** prefix: `<testID>`, `<testID>-search`, `<testID>-pick-<id>` */
  testID: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [all, setAll] = useState<ServerMember[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible || all) return;
    let live = true;
    server
      .fetchMembers()
      .then(({ members }) => live && setAll(members))
      .catch(() => live && setAll([]));
    return () => {
      live = false;
    };
  }, [visible, all, server]);

  const rows = useMemo(() => (all ?? []).map((m) => ({ id: m.id.user, name: memberName(m), username: m.user?.username, member: m })), [all]);
  const candidates = pickableMembers(rows, query, exclude);

  return (
    <Sheet visible={visible} onClose={onClose} testID={testID}>
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      <View style={{ flexDirection: "row" }}>
        <SearchField value={query} onChange={setQuery} placeholder={t`Search members`} testID={`${testID}-search`} />
      </View>
      {error}
      {!all ? (
        <ActivityIndicator color={palette.accent} />
      ) : candidates.length === 0 ? (
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center", paddingVertical: 16 }}>
          {t`No members found.`}
        </AText>
      ) : (
        <RowGroup>
          {candidates.map(({ id, name, member }, i) => (
            <Pressable
              key={id}
              testID={`${testID}-pick-${id}`}
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => onPick(member)}
              style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
            >
              <Avatar url={member.avatarURL ?? member.user?.avatarURL} name={name} size={32} />
              <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                {name}
              </AText>
              {busy === id ? <ActivityIndicator size="small" color={palette.accent} /> : <Icon name="plus" size={18} color={palette.iconMuted} />}
            </Pressable>
          ))}
        </RowGroup>
      )}
    </Sheet>
  );
}
