import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText, AuthButton, BackButton, ErrorBox, TextField } from "@/ui/auth/parts";

/** Custom status text */
export default function StatusSettings() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const [text, setText] = useState(self?.status?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  async function save(value: string) {
    if (!self) return;
    setBusy(true);
    setError(null);
    try {
      await self.edit(value ? { status: { ...(self.status ?? {}), text: value } } : ({ remove: ["StatusText"] } as never));
      router.back();
    } catch (err) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }}>
          {t`Custom status`}
        </AText>
      </ScreenHeader>
      <View style={{ padding: 16, gap: 16 }}>
        <TextField label={t`Custom status`} value={text} onChangeText={setText} maxLength={128} testID="status-text" />
        {error ? <ErrorBox message={errorText(i18n, error)} details={error.technical} /> : null}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <BackButton label={t`Clear status`} onPress={() => save("")} />
          <AuthButton status={busy ? "submitting" : "ready"} onPress={() => save(text.trim())}>
            {t`Save`}
          </AuthButton>
        </View>
      </View>
    </SafeAreaView>
  );
}
