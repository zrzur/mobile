import { Trans, useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { showToast } from "@/chat/overlays";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, Button, Chip, Icon, Sheet, TextField } from "@/ui/kit";
import { InlineError } from "@/ui/settings/parts";
import { SUPPORT_CATEGORIES, type SupportCategory, ticketReady } from "@/ui/settings/user/userPrefs";

import { replySubject } from "./official";

/** "Write to support" with the answer linked to the official message (web: ContactSupport NewTicket with `related`) */
function TicketSheet({ related, subject: initial, onClose }: { related?: string; subject: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const label: Record<SupportCategory, string> = {
    account: t`My account`,
    billing: t`Payments and Feather`,
    safety: t`Safety and reports`,
    bug: t`Something isn't working`,
    feature: t`An idea for Zrzur`,
    other: t`Something else`,
  };
  const [category, setCategory] = useState<SupportCategory>(related ? "other" : "account");
  const [subject, setSubject] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.api.post("/support/tickets" as never, { category, subject: subject.trim(), body: body.trim(), related } as never);
      showToast(t`Your ticket was sent. The answer comes to Support in your settings.`);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    // typed text is not thrown away by a tap on the scrim
    <Sheet visible onClose={() => !body.trim() && onClose()} testID="official-ticket">
      <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {t`Write to support`}
      </AText>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`About`}
      </AText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t`About`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SUPPORT_CATEGORIES.map((c) => (
          <Chip key={c} radio label={label[c]} selected={c === category} onPress={() => setCategory(c)} testID={`official-category-${c}`} />
        ))}
      </View>
      <TextField label={t`Subject`} value={subject} onChangeText={setSubject} maxLength={120} testID="official-subject" />
      <TextField label={t`Your message`} value={body} onChangeText={setBody} maxLength={4000} multiline numberOfLines={6} style={{ minHeight: 120, textAlignVertical: "top" }} testID="official-body" />
      <InlineError message={error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" label={t`Cancel`} onPress={onClose} />
        <Button label={t`Send`} status={busy ? "submitting" : "ready"} disabled={busy || !ticketReady(subject, body)} onPress={() => void send()} testID="official-send" />
      </View>
    </Sheet>
  );
}

/**
 * Takes the place of the message box in the conversation with Zrzur's
 * official account (web: support/OfficialBanner): nobody can write there,
 * so it points to a ticket that answers the newest official message.
 */
export function OfficialBanner({ channel }: { channel: Channel }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [writing, setWriting] = useState(false);
  const latest = useFields(channel, (c) => c.lastMessageId);
  const message = latest ? client.messages.get(latest) : undefined;
  const subject = replySubject(message?.content, (first) => t`Re: ${first}`);
  return (
    <View
      testID="official-banner"
      accessibilityRole="summary"
      style={{ margin: 16, marginTop: 8, padding: 16, gap: 12, borderRadius: 14, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.borderSoft }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Icon name="shield-check" size={28} color={palette.accentText} />
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={15} line={20} weight="bold" color={palette.fg}>
            <Trans>Only official messages from the Zrzur team arrive here.</Trans>
          </AText>
          <AText size={13} line={18} color={palette.fg2}>
            <Trans>To answer one, open a ticket.</Trans>
          </AText>
        </View>
      </View>
      <Button fill label={t`Reply in a ticket`} onPress={() => setWriting(true)} testID="official-reply" />
      {writing ? <TicketSheet related={latest ?? undefined} subject={subject} onClose={() => setWriting(false)} /> : null}
    </View>
  );
}
