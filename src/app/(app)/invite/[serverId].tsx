import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { errorDetails, errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { ErrorBox } from "@/ui/auth/parts";
import { UserAvatar } from "@/ui/Avatar";
import { DEFAULT_EXPIRY, EXPIRY_CHOICES, USES_CHOICES, inviteLink, inviteRequest, shownFriends } from "@/ui/invite/inviteLogic";
import { AText, Button, RowGroup, ScreenHeader, SearchField, copyToClipboard, shareText } from "@/ui/kit";
import { PickerSheet, SelectField } from "@/ui/settings/server/controls";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/**
 * Invite people to a server (web: CreateInvite): send the link straight to a
 * friend, or copy or share it; how long it lasts and how many people can use
 * it are chips under the link. A changed choice makes a new link (the old one
 * keeps its own rules).
 */
export default function Invite() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [expiry, setExpiry] = useState<number | null>(DEFAULT_EXPIRY);
  const [maxUses, setMaxUses] = useState(0);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Record<string, "sending" | "sent">>({});
  const asked = useRef(0);

  // a new link for every choice; an older answer that lands late is dropped
  useEffect(() => {
    if (!server) return;
    const channel = server.channels.find((c) => !c.isVoice && c.havePermission("InviteOthers")) ?? server.defaultChannel;
    if (!channel) return;
    const ticket = ++asked.current;
    channel
      .createInvite(inviteRequest(expiry, maxUses))
      .then((invite) => {
        if (ticket !== asked.current) return;
        const raw = invite as unknown as { _id?: string; id?: string };
        setLink(inviteLink(raw._id ?? raw.id ?? ""));
      })
      .catch((err) => ticket === asked.current && setError(toAuthError(err)));
  }, [server, expiry, maxUses]);

  const ids = useSolid(
    useCallback(
      () =>
        client.users
          .filter((u) => u.relationship === "Friend")
          .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
          .map((u) => u.id)
          .join(","),
      [client],
    ),
  );
  const friends = useMemo(() => {
    const list = ids ? ids.split(",").map((id) => client.users.get(id)!).filter(Boolean) : [];
    const q = foldSearch(query.trim());
    // the first five only, so the link and its options stay in view; search finds the rest
    return shownFriends(list, q ? (u) => [u.displayName ?? "", u.username].some((n) => foldSearch(n).includes(q)) : undefined);
  }, [ids, client, query]);
  const [picking, setPicking] = useState<"expiry" | "uses" | null>(null);

  async function send(userId: string) {
    const user = client.users.get(userId);
    if (!link || !user || sent[userId]) return;
    setSent((s) => ({ ...s, [userId]: "sending" }));
    try {
      const dm = await user.openDM();
      await dm.sendMessage(link);
      setSent((s) => ({ ...s, [userId]: "sent" }));
    } catch (err) {
      setSent((s) => {
        const next = { ...s };
        delete next[userId];
        return next;
      });
      setError(toAuthError(err));
    }
  }

  /** a changed choice makes a new link (the old one keeps its own rules) */
  const choose = (apply: () => void) => {
    setLink(null);
    setSent({});
    setError(null);
    apply();
  };

  const expiryLabel = (choice: number | null) => {
    switch (choice) {
      case 1800:
        return t`30 minutes`;
      case 3600:
        return t`1 hour`;
      case 6 * 3600:
        return t`6 hours`;
      case 12 * 3600:
        return t`12 hours`;
      case 86400:
        return t`1 day`;
      case DEFAULT_EXPIRY:
        return t`7 days`;
      default:
        return t`Never`;
    }
  };
  const place = server?.name ?? "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back modal>
        <AText autoDir={place} size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Invite friends to ${server?.name ?? ""}`}
        </AText>
      </ScreenHeader>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} {...keyboardScrollProps}>
        <AText size={15} line={22} color={palette.fg2}>
          {t`Send it straight to a friend, or share the link.`}
        </AText>
        <View style={{ flexDirection: "row" }}>
          <SearchField value={query} onChange={setQuery} placeholder={t`Search for friends`} testID="invite-friends-search" />
        </View>
        {friends.length ? (
          // the friends as one group of rows, split by hairlines (web: Friends box)
          <RowGroup>
            {friends.map((user, i) => (
              <View key={user.id} style={{ minHeight: 52, paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }} testID={`invite-friend-${user.id}`}>
                <UserAvatar user={user} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
                    {user.displayName ?? user.username}
                  </AText>
                  <AText size={13} line={18} color={palette.muted} numberOfLines={1}>
                    {`@${user.username}`}
                  </AText>
                </View>
                <Button
                  size="sm"
                  variant={sent[user.id] === "sent" ? "ghost" : "tonal"}
                  icon={sent[user.id] === "sent" ? "check" : undefined}
                  label={sent[user.id] === "sent" ? t`Sent` : t`Invite`}
                  status={sent[user.id] === "sending" ? "submitting" : "ready"}
                  disabled={!link || sent[user.id] === "sent"}
                  onPress={() => void send(user.id)}
                />
              </View>
            ))}
          </RowGroup>
        ) : (
          <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center", paddingVertical: 12 }}>
            {query.trim() ? t`No friends match your search.` : t`Add some friends first, or share the link below.`}
          </AText>
        )}

        <AText size={13} line={20} weight="semibold" color={palette.fg2}>
          {t`Or send an invite link to a friend`}
        </AText>
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <View style={{ minHeight: 44, borderRadius: 10, backgroundColor: palette.field, paddingHorizontal: 12, justifyContent: "center" }}>
          {link ? (
            // a link reads left to right: in Arabic its start (https://) stays in view
            <AText size={16} line={22} color={palette.fg} selectable numberOfLines={1} style={{ writingDirection: "ltr", textAlign: "left" }} testID="invite-link">
              {link}
            </AText>
          ) : error ? null : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={palette.accent} />
              <AText size={14} line={20} color={palette.muted}>
                {t`Generating invite…`}
              </AText>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              fill
              testID="invite-copy"
              icon={copied ? "check" : "copy"}
              label={copied ? t`Copied` : t`Copy`}
              disabled={!link}
              onPress={async () => {
                if (!link) return;
                await copyToClipboard(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button fill variant="tonal" icon="share-network" testID="invite-share" label={t`Share`} disabled={!link} onPress={() => link && void shareText({ message: link, url: link })} />
          </View>
        </View>

        {/* web: two selects, one column on phones; each opens its options in a sheet */}
        <View style={{ gap: 4 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Expires after`}
          </AText>
          <SelectField testID="invite-expiry" label={t`Expires after`} value={expiryLabel(expiry)} disabled={!link && !error} onPress={() => setPicking("expiry")} />
        </View>
        <View style={{ gap: 4 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Max uses`}
          </AText>
          <SelectField testID="invite-uses" label={t`Max uses`} value={maxUses ? String(maxUses) : t`No limit`} disabled={!link && !error} onPress={() => setPicking("uses")} />
        </View>
        <AText size={13} line={20} color={palette.muted}>
          {expiry !== null ? t`This link expires after ${expiryLabel(expiry)}.` : t`This link never expires.`}
        </AText>
      </ScrollView>
      <PickerSheet
        testID="invite-expiry-sheet"
        visible={picking === "expiry"}
        title={t`Expires after`}
        // "never" travels as -1: a sheet value can't be null
        options={EXPIRY_CHOICES.map((choice) => ({ value: choice ?? -1, label: expiryLabel(choice) }))}
        value={expiry ?? -1}
        onPick={(value) => {
          const next = value === -1 ? null : value;
          if (next !== expiry) choose(() => setExpiry(next));
        }}
        onClose={() => setPicking(null)}
      />
      <PickerSheet
        testID="invite-uses-sheet"
        visible={picking === "uses"}
        title={t`Max uses`}
        options={USES_CHOICES.map((choice) => ({ value: choice, label: choice ? String(choice) : t`No limit` }))}
        value={maxUses}
        onPick={(value) => value !== maxUses && choose(() => setMaxUses(value))}
        onClose={() => setPicking(null)}
      />
    </SafeAreaView>
  );
}
