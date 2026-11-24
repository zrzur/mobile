import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";

import { DialogSheet } from "../MfaFlow";
import { humanSize, memberEdit } from "./profile-logic";
import { TextButton } from "./profile-parts";

type Picked = { uri: string; name: string; type: string };

/** Pick an image, cropped square by the system picker */
export async function pickImage(aspect: [number, number]): Promise<Picked | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect, quality: 0.92 });
  if (result.canceled) return undefined;
  const a = result.assets[0];
  return { uri: a.uri, name: a.fileName ?? "image.jpg", type: a.mimeType ?? "image/jpeg" };
}

/** Dialog "Change identity on {serverName}" (web ServerIdentity, own member) */
export function ServerIdentitySheet({ server, onClose }: { server: Server; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const member = server.member;
  const m = useFields(member, (v) => ({
    nickname: v.nickname ?? "",
    pronouns: v.pronouns ?? "",
    avatar: v.avatar ? v.avatarURL : undefined,
    userAvatar: v.user?.avatarURL,
    displayName: v.user?.displayName ?? "",
    userPronouns: v.user?.pronouns ?? "",
  }));
  const [nickname, setNickname] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<Picked | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverName = server.name;
  const nick = nickname ?? m?.nickname ?? "";
  const pro = pronouns ?? m?.pronouns ?? "";
  const ownAvatar = avatar === null ? undefined : avatar ? avatar.uri : m?.avatar;
  const limit = client.limits?.file_upload_size_limits?.avatars;
  const size = limit ? humanSize(limit) : "";

  const save = async () => {
    if (!member || !m) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = avatar ? await client.uploadFile("avatars", avatar as unknown as File) : avatar;
      const body = memberEdit({ nickname: m.nickname, pronouns: m.pronouns }, { nickname: nick, pronouns: pro, avatar: uploaded });
      if (Object.keys(body).length) await member.edit(body as never);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const change = async () => {
    const picked = await pickImage([1, 1]);
    if (picked) setAvatar(picked);
  };

  return (
    <DialogSheet
      visible
      onClose={onClose}
      icon="user-edit"
      title={t`Change identity on ${serverName}`}
      text={t`Server only. Empty fields use your main profile.`}
      error={error}
      testID="server-identity-dialog"
      actions={[
        { label: t`Save`, kind: "primary", onPress: () => void save(), busy, testID: "server-identity-save" },
        { label: t`Cancel`, onPress: onClose },
      ]}
    >
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t`Change server avatar`} onPress={() => void change()}>
          <Avatar url={ownAvatar ?? m?.userAvatar} name={nick || m?.displayName} size={112} />
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {ownAvatar ? t`Server avatar` : t`Using your main avatar`}
          </AText>
          {size ? (
            <AText size={13} line={18} color={palette.muted}>
              {t`Up to ${size}`}
            </AText>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <TextButton label={t`Change server avatar`} onPress={() => void change()} testID="server-identity-avatar" />
            {ownAvatar ? <TextButton label={t`Remove`} icon="trash" danger onPress={() => setAvatar(null)} /> : null}
          </View>
        </View>
      </View>
      <TextField label={t`Nickname`} value={nick} onChangeText={setNickname} placeholder={m?.displayName} maxLength={32} helper={`${nick.length}/32`} testID="server-identity-nickname" />
      <TextField
        label={t`Pronouns`}
        value={pro}
        onChangeText={setPronouns}
        placeholder={m?.userPronouns || t`e.g. they/them`}
        maxLength={24}
        helper={`${pro.length}/24`}
        testID="server-identity-pronouns"
      />
    </DialogSheet>
  );
}
