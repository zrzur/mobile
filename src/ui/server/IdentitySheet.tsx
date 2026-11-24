import { useLingui } from "@lingui/react/macro";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText, AuthButton, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

type Picked = { uri: string; name: string; type: string };

/**
 * Your name, pronouns and picture on one server (web: ServerIdentity
 * modal). Server only; empty fields use your main profile.
 */
export function IdentitySheet({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const me = useFields(server, (s) => ({
    name: s.name,
    nickname: s.member?.nickname ?? "",
    pronouns: (s.member as unknown as { pronouns?: string } | undefined)?.pronouns ?? "",
    avatar: s.member?.avatar ? s.member.animatedAvatarURL : undefined,
    mainAvatar: s.member?.user?.avatarURL,
    displayName: s.member?.user?.displayName ?? s.member?.user?.username ?? "",
    mainPronouns: (s.member?.user as unknown as { pronouns?: string } | undefined)?.pronouns,
    canNick: s.havePermission("ChangeNickname"),
    canAvatar: s.havePermission("ChangeAvatar"),
  }));
  const [nickname, setNickname] = useState<string>();
  const [pronouns, setPronouns] = useState<string>();
  const [avatar, setAvatar] = useState<Picked | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  if (!server || !me) return null;
  const nick = nickname ?? me.nickname;
  const pro = pronouns ?? me.pronouns;
  const shownAvatar = avatar === null ? undefined : (avatar?.uri ?? me.avatar);
  const dirty = nickname !== undefined || pronouns !== undefined || avatar !== undefined;
  const serverName = me.name;

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    const a = result.assets?.[0];
    if (result.canceled || !a) return;
    setAvatar({ uri: a.uri, name: a.fileName ?? "avatar.jpg", type: a.mimeType ?? "image/jpeg" });
  };

  const save = async () => {
    const member = server.member;
    if (saving || !member) return;
    setError(undefined);
    setSaving(true);
    try {
      const remove: string[] = [];
      const changes: Record<string, unknown> = { remove };
      if (nickname !== undefined) {
        if (nickname.trim()) changes.nickname = nickname.trim();
        else remove.push("Nickname");
      }
      if (avatar === null) remove.push("Avatar");
      else if (avatar) changes.avatar = await client.uploadFile("avatars", avatar as unknown as File);
      if (pronouns !== undefined) {
        if (pronouns.trim()) changes.pronouns = pronouns.trim();
        else remove.push("Pronouns");
      }
      await member.edit(changes as never);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} testID="server-identity">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="identification-card" size={22} color={palette.accentText} />
        <AText size={18} line={26} weight="bold" color={palette.header} style={{ flex: 1 }} accessibilityRole="header">
          {t`Change identity on ${serverName}`}
        </AText>
      </View>
      <AText size={15} line={22} color={palette.fg2}>
        {t`Server only. Empty fields use your main profile.`}
      </AText>
      {me.canAvatar ? (
        <View style={{ alignItems: "center", gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t`Change server avatar`} onPress={() => void pick()} style={{ opacity: shownAvatar ? 1 : 0.6 }}>
            <Avatar url={shownAvatar ?? me.mainAvatar} name={me.displayName} size={112} />
          </Pressable>
          <AText size={13} line={18} color={palette.fg2}>
            {shownAvatar ? t`Server avatar` : t`Using your main avatar`}
          </AText>
          {shownAvatar ? (
            <Pressable accessibilityRole="button" onPress={() => setAvatar(null)} style={{ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="trash" size={16} color={palette.fg2} />
              <AText size={14} line={20} weight="semibold" color={palette.fg2}>
                {t`Remove`}
              </AText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {me.canNick ? <TextField testID="identity-nickname" label={t`Nickname`} value={nick} onChangeText={setNickname} maxLength={32} placeholder={me.displayName} autoComplete="off" /> : null}
      <TextField testID="identity-pronouns" label={t`Pronouns`} value={pro} onChangeText={setPronouns} maxLength={24} placeholder={me.mainPronouns ?? t`e.g. they/them`} autoComplete="off" />
      {error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: "center" }}>
          <AText size={15} line={20} weight="semibold" color={palette.fg2}>
            {t`Cancel`}
          </AText>
        </Pressable>
        <AuthButton status={saving ? "submitting" : "ready"} disabled={!dirty} onPress={() => void save()} testID="identity-save">
          {t`Save`}
        </AuthButton>
      </View>
    </Sheet>
  );
}
