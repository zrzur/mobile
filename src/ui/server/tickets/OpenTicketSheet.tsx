/**
 * Open a ticket in a server that has kinds of ticket (web: OpenTicket
 * modal): what it is about, a few words, Open ticket. A server with one
 * kind has it chosen already; the server hands back a ticket already open.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";

import { initialKind, type TicketKind } from "./ticketLogic";
import { openTicket } from "./ticketStore";

export const openChannel = (id: string) => router.push({ pathname: "/channel/[id]", params: { id } });

export function OpenTicketSheet({ serverId, types, onClose }: { serverId: string; types: TicketKind[]; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [kind, setKind] = useState<string | undefined>(() => initialKind(types));
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const open = async () => {
    if (!kind || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const id = await openTicket(client, serverId, subject.trim() || undefined, kind);
      haptics.success();
      onClose();
      openChannel(id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} testID="open-ticket">
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="ticket" size={22} color={palette.accentText} />
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {t`Open a ticket`}
          </AText>
        </View>
        <AText size={14} line={20} color={palette.fg2}>
          {t`A private channel between you and the staff of this server.`}
        </AText>
      </View>
      <View style={{ gap: 8 }}>
        <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ paddingHorizontal: 2 }}>
          {t`What is it about?`}
        </AText>
        <View accessibilityRole="radiogroup" accessibilityLabel={t`What is it about?`} style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>
          {types.map((type, i) => {
            const on = kind === type.id;
            return (
              <Pressable
                key={type.id}
                testID={`ticket-type-${type.id}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  haptics.selection();
                  setKind(type.id);
                }}
                style={({ pressed }) => ({ minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: on ? palette.navSelected : pressed ? palette.navHover : "transparent" })}
              >
                {/* the radio mark: a ring, filled with the action colour when chosen */}
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 5 : 2, borderColor: on ? palette.accent : palette.muted }} />
                <AText autoDir size={14} line={20} weight="medium" color={palette.fg} style={{ flex: 1 }}>
                  {type.name}
                </AText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <TextField label={t`In a few words (optional)`} value={subject} onChangeText={setSubject} maxLength={100} testID="ticket-subject" />
      {error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" label={t`Cancel`} onPress={onClose} />
        <Button label={t`Open ticket`} status={busy ? "submitting" : "ready"} disabled={!kind} onPress={() => void open()} testID="ticket-open" />
      </View>
    </Sheet>
  );
}
