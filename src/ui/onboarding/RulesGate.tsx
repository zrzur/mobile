import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

/** Whether the rules gate replaces the message box in a channel of this server */
export function useMustAcceptRules(serverId: string | undefined): boolean {
  const server = useServer(serverId);
  return useFields(server, (s) => s.mustAcceptRules) ?? false;
}

/**
 * Rules screening (web: RulesGate): someone who joined after it was
 * switched on accepts the server rules before they can write. Shown in
 * place of the message box.
 */
export function RulesGate({ serverId }: { serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const rulesId = useFields(server, (s) => s.rulesChannelId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (!server) return null;

  async function accept() {
    if (!server) return;
    setPending(true);
    setError(undefined);
    try {
      await server.acceptRules();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <View testID="rules-gate" accessibilityRole="summary" style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Icon name="book-check" size={18} color={palette.iconNeutral} />
      <AText size={14} line={20} color={error ? palette.danger : palette.fg} style={{ flex: 1, minWidth: 160 }} accessibilityRole={error ? "alert" : undefined}>
        {error ?? t`Accept the server rules to start writing here.`}
      </AText>
      <View style={{ flexDirection: "row", gap: 8, marginStart: "auto" }}>
        {rulesId ? (
          <Pressable testID="rules-gate-read" accessibilityRole="button" onPress={() => router.push({ pathname: "/channel/[id]", params: { id: rulesId } })} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }}>
            <AText size={14} line={20} weight="semibold" color={palette.accentText}>
              {t`Read the rules`}
            </AText>
          </Pressable>
        ) : null}
        <Button size="sm" testID="rules-gate-accept" label={t`Accept the rules`} status={pending ? "submitting" : "ready"} onPress={() => void accept()} />
      </View>
    </View>
  );
}
