import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { dateLocale, shortDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Chip } from "@/ui/kit/Chip";

import { InlineError, SettingsPage, SmallButton } from "../parts";
import { LoadLine, NavRow, Pill } from "./userParts";
import { SUPPORT_CATEGORIES, type SupportCategory, ticketReady } from "./userPrefs";

type TicketMessage = {
  id: string;
  staff: boolean;
  body: string;
  created_at: number;
};
type Ticket = {
  _id: string;
  category: string;
  subject: string;
  status: string;
  messages: TicketMessage[];
  created_at: number;
  updated_at: number;
  can_reply: boolean;
};

function useLabels() {
  const { t } = useLingui();
  const category: Record<SupportCategory, string> = {
    account: t`My account`,
    billing: t`Payments and Feather`,
    safety: t`Safety and reports`,
    bug: t`Something isn't working`,
    feature: t`An idea for Zrzur`,
    other: t`Something else`,
  };
  const status: Record<string, string> = {
    Open: t`Waiting for the team`,
    Answered: t`Answered`,
    Closed: t`Closed`,
  };
  return {
    category: (c: string) => category[c as SupportCategory] ?? c,
    status: (s: string) => status[s] ?? s,
  };
}

/** Big text box for the sheets */
const AREA = { minHeight: 120, textAlignVertical: "top" as const };

/** Dialog "Write to support" */
function NewTicketSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (ticket: Ticket) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useLabels();
  const [category, setCategory] = useState<SupportCategory>("account");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const ticket = (await client.api.post("/support/tickets" as never, { category, subject: subject.trim(), body: body.trim() } as never)) as Ticket;
      onCreated(ticket);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  // typed text is not thrown away by a tap on the scrim
  const close = () => {
    if (!body.trim()) onClose();
  };
  return (
    <Sheet visible onClose={close} testID="support-new">
      <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {t`Write to support`}
      </AText>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`About`}
      </AText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t`About`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SUPPORT_CATEGORIES.map((c) => {
          const on = c === category;
          return <Chip key={c} radio testID={`support-category-${c}`} label={labels.category(c)} selected={on} onPress={() => setCategory(c)} />;
        })}
      </View>
      <TextField label={t`Subject`} value={subject} onChangeText={setSubject} maxLength={120} testID="support-subject" />
      <TextField label={t`Your message`} value={body} onChangeText={setBody} maxLength={4000} multiline numberOfLines={6} style={AREA} testID="support-body" />
      <InlineError message={error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <SmallButton label={t`Cancel`} onPress={onClose} />
        <SmallButton primary label={t`Send`} disabled={busy || !ticketReady(subject, body)} onPress={() => void send()} testID="support-send" />
      </View>
    </Sheet>
  );
}

/** Dialog: one ticket with its messages and a reply box */
function TicketSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useLabels();
  const [ticket, setTicket] = useState<Ticket>();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [tick, setTick] = useState(0);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    (client.api.get(`/support/tickets/${id}` as never) as Promise<Ticket>)
      .then((tk) => {
        if (!live) return;
        setTicket(tk);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [client, id, tick]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await run();
      setTick((n) => n + 1);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} testID="support-ticket">
      <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {ticket?.subject ?? ""}
      </AText>
      {ticket ? (
        <AText size={13} line={18} color={palette.muted}>
          {labels.status(ticket.status)}
        </AText>
      ) : null}
      {state === "loading" ? <ActivityIndicator color={palette.muted} /> : null}
      {state === "error" ? (
        <View style={{ gap: 8, alignItems: "flex-start" }}>
          <AText size={14} line={20} color={palette.danger}>
            {t`This ticket couldn't be loaded.`}
          </AText>
          <SmallButton
            label={t`Try again`}
            onPress={() => {
              setState("loading");
              setTick((n) => n + 1);
            }}
          />
        </View>
      ) : null}
      {ticket ? (
        <>
          <View style={{ gap: 8 }}>
            {ticket.messages.map((m) => (
              <View
                key={m.id}
                style={{
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                  backgroundColor: palette.field,
                  borderStartWidth: m.staff ? 3 : 0,
                  borderStartColor: palette.accent,
                }}
              >
                <AText size={12} line={16} weight="semibold" color={palette.muted}>
                  {`${m.staff ? t`Zrzur support` : t`You`} · ${shortDate(new Date(m.created_at), i18n.locale)}`}
                </AText>
                <AText size={14} line={22} color={palette.fg} selectable>
                  {m.body}
                </AText>
              </View>
            ))}
          </View>
          {ticket.can_reply ? (
            <>
              <TextField label={t`Reply`} value={reply} onChangeText={setReply} maxLength={4000} multiline numberOfLines={3} style={{ minHeight: 72, textAlignVertical: "top" }} testID="support-reply" />
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                {ticket.status === "Closed" ? (
                  <SmallButton label={t`Reopen`} disabled={busy} onPress={() => void act(() => client.api.post(`/support/tickets/${id}/reopen` as never))} testID="support-reopen" />
                ) : (
                  <SmallButton label={t`My problem is solved`} disabled={busy} onPress={() => void act(() => client.api.post(`/support/tickets/${id}/close` as never))} testID="support-solved" />
                )}
                <SmallButton
                  primary
                  label={t`Send reply`}
                  disabled={busy || !reply.trim()}
                  onPress={() =>
                    void act(async () => {
                      await client.api.post(`/support/tickets/${id}/messages` as never, { body: reply.trim() } as never);
                      setReply("");
                    })
                  }
                  testID="support-send-reply"
                />
              </View>
            </>
          ) : (
            <AText size={14} line={20} color={palette.muted}>
              {t`This ticket is closed. Write a new one if you still need help.`}
            </AText>
          )}
        </>
      ) : null}
      <InlineError message={error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <SmallButton label={t`Close`} onPress={onClose} testID="support-ticket-close" />
      </View>
    </Sheet>
  );
}

/** Contact support (web: ContactSupport) */
export function SupportPage() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useLabels();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [tick, setTick] = useState(0);
  // one sheet at a time: "new" or a ticket id
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (client.api.get("/support/tickets" as never) as Promise<Ticket[]>)
      .then((list) => {
        if (!live) return;
        setTickets(list ?? []);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [client, tick]);

  return (
    <SettingsPage title={t`Contact support`} testID="user-support">
      {/* web: the tickets sit 12 under the Write card */}
      <View style={{ gap: 12 }}>
        <RowGroup>
          <NavRow
            first
            icon="headset"
            title={t`Write to support`}
            description={t`Ask the Zrzur team about your account, payments, safety or anything else. We answer here.`}
            onPress={() => setSheet("new")}
            testID="support-write"
          />
        </RowGroup>
        <View style={{ gap: 12 }} testID="support-tickets">
          {/* loading spinner, or the error with Try again (web SettingsStatus) */}
          <LoadLine
            state={state}
            error={t`Your tickets couldn't be loaded. Try again later.`}
            onRetry={() => {
              setState("loading");
              setTick((n) => n + 1);
            }}
          />
          {state === "ready" && tickets.length === 0 ? (
            <AText size={14} line={20} color={palette.muted}>
              {t`You haven't written to support yet.`}
            </AText>
          ) : null}
          {tickets.length ? (
            <View style={{ gap: 8 }}>
              {tickets.map((tk) => (
                <Pressable
                  key={tk._id}
                  testID={`support-ticket-${tk._id}`}
                  accessibilityRole="button"
                  onPress={() => setSheet(tk._id)}
                  style={({ pressed }) => ({
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    gap: 4,
                    backgroundColor: pressed ? palette.navSelected : palette.field,
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <AText autoDir size={16} line={22} color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
                      {tk.subject}
                    </AText>
                    <Pill tone={tk.status === "Answered" ? "accent" : undefined}>{labels.status(tk.status)}</Pill>
                  </View>
                  <AText size={13} line={18} color={palette.muted}>
                    {`${labels.category(tk.category)} · ${new Intl.DateTimeFormat(dateLocale(i18n.locale), { year: "numeric", month: "short", day: "numeric" }).format(new Date(tk.updated_at))}`}
                  </AText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {sheet === "new" ? (
        <NewTicketSheet
          onClose={() => setSheet(null)}
          onCreated={(ticket) => {
            setTick((n) => n + 1);
            setSheet(ticket._id);
          }}
        />
      ) : sheet ? (
        <TicketSheet id={sheet} onClose={() => setSheet(null)} onChanged={() => setTick((n) => n + 1)} />
      ) : null}
    </SettingsPage>
  );
}
