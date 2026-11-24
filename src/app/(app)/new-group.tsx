import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { CenterNote, ScreenHeader, SearchField } from "@/ui/app/parts";
import { AText, ErrorBox, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/kit/Button";
import { KeyboardFooter, keyboardScrollProps } from "@/ui/kit/keyboard";
import { useLeaveGuard } from "@/ui/kit/leaveGuard";

/**
 * Create a group with friends (web: create_group), or with `?group=<id>`
 * add friends to an existing group (web: AddMembersToGroup): friends who
 * are not in it yet, searchable, added one after another.
 */
export default function NewGroup() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const { group: groupId } = useLocalSearchParams<{ group?: string }>();
  const adding = !!groupId;
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  // a typed name or picked friends stop Back and swipe-down with the web's nudge
  useLeaveGuard(!busy && (name.trim() !== "" || picked.length > 0));
  const ids = useSolid(
    useCallback(() => {
      const inGroup = groupId ? client.channels.get(groupId)?.recipientIds : undefined;
      return client.users
        .filter((u) => u.relationship === "Friend" && !inGroup?.has(u.id))
        .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
        .map((u) => u.id)
        .join(",");
    }, [client, groupId]),
  );
  const friends = useMemo(() => {
    const list = ids ? ids.split(",").map((id) => client.users.get(id)!).filter(Boolean) : [];
    const q = foldSearch(filter.trim());
    return q ? list.filter((u) => [u.displayName ?? "", u.username].some((n) => foldSearch(n).includes(q))) : list;
  }, [ids, client, filter]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const fallback = friends.filter((f) => picked.includes(f.id)).map((f) => f.displayName ?? f.username).slice(0, 3).join(", ");
      const group = await client.channels.createGroup(name.trim() || fallback || t`Group`, picked);
      router.replace({ pathname: "/channel/[id]", params: { id: group.id } });
    } catch (err) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const group = groupId ? client.channels.get(groupId) : undefined;
    if (!group) return;
    setBusy(true);
    setError(null);
    try {
      for (const user of picked) await group.addMember(user);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: "/channel/[id]", params: { id: group.id } });
    } catch (err) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView testID={adding ? "add-members" : "new-group"} style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back modal>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }} accessibilityRole="header">
          {adding ? t`Add friends to group` : t`Create a new group`}
        </AText>
      </ScreenHeader>
      <View style={{ padding: 16, gap: 12 }}>
        {adding ? (
          <View style={{ flexDirection: "row" }}>
            <SearchField value={filter} onChange={setFilter} placeholder={t`Search for users...`} testID="group-search" />
          </View>
        ) : (
          <TextField label={t`Group name`} value={name} onChangeText={setName} maxLength={32} testID="group-name" />
        )}
        {error ? <ErrorBox message={errorText(i18n, error)} details={error.technical} /> : null}
      </View>
      <FlashList
        data={friends}
        keyExtractor={(u) => u.id}
        extraData={picked}
        {...keyboardScrollProps}
        ListEmptyComponent={<CenterNote icon="users">{t`Add friends first to start a group with them.`}</CenterNote>}
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          return (
            <Pressable
              testID={`group-friend-${item.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => setPicked((p) => (on ? p.filter((x) => x !== item.id) : [...p, item.id]))}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 56,
                marginHorizontal: 8,
                paddingHorizontal: 8,
                borderRadius: 10,
                backgroundColor: pressed ? palette.navSelected : "transparent",
              })}
            >
              <Avatar url={item.avatarURL} name={item.displayName ?? item.username} size={40} />
              <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                {item.displayName ?? item.username}
              </AText>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: on ? "transparent" : palette.borderStrong,
                  backgroundColor: on ? palette.accent : palette.field,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? (
                  <Svg width={12} height={12} viewBox="0 0 12 12">
                    <Path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke={palette.onAccent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <KeyboardFooter gap={16} inset={insets.bottom} style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
        <View style={{ flex: 1 }}>
          <Button fill status={busy ? "submitting" : "ready"} disabled={picked.length === 0} onPress={() => void (adding ? add() : create())} testID={adding ? "group-add" : "group-create"} label={adding ? t`Add` : t`Create`} />
        </View>
      </KeyboardFooter>
    </SafeAreaView>
  );
}
