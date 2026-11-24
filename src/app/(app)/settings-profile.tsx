import { useLingui } from "@lingui/react/macro";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText, AuthButton, ErrorBox, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/** Display name and picture */
export default function ProfileSettings() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const me = useFields(self, (u) => ({ name: u.displayName ?? "", username: u.username, url: u.avatarURL }));
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? (me && me.name !== me.username ? me.name : "");
  const [status, setStatus] = useState<"ready" | "submitting" | "success">("ready");
  const [error, setError] = useState<AuthError | null>(null);

  async function save() {
    if (!self) return;
    setStatus("submitting");
    setError(null);
    try {
      await self.edit(name.trim() ? { display_name: name.trim() } : ({ remove: ["DisplayName"] } as never));
      setStatus("success");
      setTimeout(() => setStatus("ready"), 1600);
    } catch (err) {
      setError(toAuthError(err));
      setStatus("ready");
    }
  }

  async function pickAvatar() {
    if (!self) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (result.canceled) return;
    const a = result.assets[0];
    setError(null);
    try {
      const id = await client.uploadFile("avatars", { uri: a.uri, name: a.fileName ?? "avatar.jpg", type: a.mimeType ?? "image/jpeg" } as unknown as File);
      await self.edit({ avatar: id });
    } catch (err) {
      setError(toAuthError(err));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }}>
          {t`Edit profile`}
        </AText>
      </ScreenHeader>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} {...keyboardScrollProps}>
        <Pressable accessibilityRole="button" accessibilityLabel={t`Change avatar`} onPress={pickAvatar} style={{ alignSelf: "center", alignItems: "center", gap: 8 }}>
          <Avatar url={me?.url} name={me?.name || me?.username} size={96} />
          <AText size={14} line={20} weight="semibold" color={palette.accentText}>
            {t`Change avatar`}
          </AText>
        </Pressable>
        <TextField label={t`Display name`} placeholder={me?.username} value={name} onChangeText={setName} maxLength={32} testID="profile-name" />
        {error ? <ErrorBox message={errorText(i18n, error)} details={error.technical} /> : null}
        <View style={{ flexDirection: "row" }}>
          <AuthButton status={status} onPress={save} testID="profile-save">
            {t`Save`}
          </AuthButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
