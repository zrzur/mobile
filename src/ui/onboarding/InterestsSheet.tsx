import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { secureStorage } from "@/lib/secureStorage";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { isLobbyColour } from "@/ui/settings/lobby";

import { interestsKey } from "./onboardingLogic";

/** Remember that the window was answered (Skip, Done, or closed) */
export function markInterestsAnswered(serverId: string, userId: string | undefined) {
  if (!userId) return;
  void secureStorage.set(interestsKey(serverId, userId), "1").catch(() => {
    // storage blocked: the window may simply ask again next time
  });
}

/**
 * Roles by interest (web: InterestsModal): asked when someone first opens
 * a server, and from the server menu any time after. Picking an answer
 * gives its role at once; picking it again takes it back. Skip or Done:
 * not asked again on this device.
 */
export function InterestsSheet({ server, visible, onClose }: { server: Server; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [answering, setAnswering] = useState<string>();
  const [error, setError] = useState<string>();
  const data = useFields(server, (s) => ({
    name: s.name,
    mine: [...(s.member?.roles ?? [])],
    questions: (s.lobby?.onboarding ?? []).map((q) => ({
      id: q.id,
      question: q.question ?? "",
      description: q.description ?? undefined,
      options: (q.options ?? [])
        .map((o) => {
          const role = s.roles.get(o.role ?? "");
          // an answer whose role was deleted is not offered
          return role ? { id: o.id, label: o.label ?? "", role: role.id, roleName: role.name, colour: role.colour ?? undefined } : null;
        })
        .filter((o) => !!o),
    })),
  }));

  const close = () => {
    markInterestsAnswered(server.id, client.user?.id);
    onClose();
  };

  async function answer(question: string, option: string, chosen: boolean) {
    if (answering) return;
    setAnswering(option);
    setError(undefined);
    try {
      await (chosen ? server.removeLobbyAnswer(question, option) : server.answerLobbyQuestion(question, option));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setAnswering(undefined);
    }
  }

  if (!data) return null;
  const name = data.name;
  return (
    <Sheet visible={visible} onClose={close} testID="interests-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="shield-check" size={22} color={palette.accentText} />
        <AText size={18} line={26} weight="bold" color={palette.header} style={{ flex: 1 }} accessibilityRole="header">
          {t`Welcome to ${name}`}
        </AText>
      </View>
      <AText size={15} line={22} color={palette.fg2}>
        {t`Pick what interests you. You get each role right away and can change it any time from the server menu.`}
      </AText>
      {data.questions.map((q) => (
        <View key={q.id} style={{ gap: 8 }}>
          <AText size={15} line={20} weight="bold" color={palette.fg}>
            {q.question}
          </AText>
          {q.description ? (
            <AText size={13} line={18} color={palette.fg2}>
              {q.description}
            </AText>
          ) : null}
          <View style={{ gap: 8 }}>
            {q.options.map((o) => {
              const assigned = data.mine.includes(o!.role);
              const roleName = o!.roleName;
              return (
                <Pressable
                  key={o!.id}
                  testID={`interest-${o!.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: assigned, disabled: !!answering, busy: answering === o!.id }}
                  accessibilityHint={assigned ? t`You have this role. Choose again to remove it.` : t`Get the ${roleName} role`}
                  disabled={!!answering}
                  onPress={() => void answer(q.id, o!.id, assigned)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: assigned ? palette.accent : palette.borderSubtle,
                    backgroundColor: pressed ? palette.navHover : palette.field,
                    opacity: answering && !assigned && answering !== o!.id ? 0.6 : 1,
                  })}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isLobbyColour(o!.colour) ? o!.colour : palette.muted }} />
                  <View style={{ flex: 1, minWidth: 0, paddingVertical: 8, gap: 2 }}>
                    <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
                      {o!.label}
                    </AText>
                    {roleName !== o!.label ? (
                      <AText size={12} line={16} weight="medium" color={palette.muted} numberOfLines={1}>
                        {t`Role: ${roleName}`}
                      </AText>
                    ) : null}
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: assigned ? palette.accent : palette.borderStrong, backgroundColor: assigned ? palette.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {answering === o!.id ? <ActivityIndicator size="small" color={assigned ? palette.onAccent : palette.fg2} /> : <Icon name={assigned ? "check" : "plus"} size={14} color={assigned ? palette.onAccent : palette.fg2} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button testID="interests-skip" variant="ghost" label={t`Skip`} onPress={close} />
        <Button testID="interests-done" label={t`Done`} onPress={close} />
      </View>
    </Sheet>
  );
}
