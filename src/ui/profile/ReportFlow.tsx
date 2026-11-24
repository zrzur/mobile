import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { type ReasonOption, type ReportStep, REPORT_MAX, afterReason, detailsOk, errorType, offeredSubs, stepBack } from "./logic";
import { StepButton, StepError } from "./StepPanel";

/** What is reported (web ReportTargetSpec) */
export type ReportSpec = {
  kind: "User" | "Bot" | "Message" | "Server" | "Channel" | "CommunityItem" | "Attachment" | "Invite" | "Webhook" | "Application" | "DiscoverServer" | "DiscoverBot";
  id: string;
  messageId?: string;
  serverId?: string;
  label?: string;
  image?: string;
  effect?: boolean;
};

type Receipt = { reference: string; status: string; existing?: boolean };

/** Translated names of the Trust & Safety values (web safety/labels.tsx) */
function useSafetyLabels() {
  const { t } = useLingui();
  const category: Record<string, { name: string; hint: string }> = {
    Harassment: { name: t`Harassment or bullying`, hint: t`Insults, targeting someone, unwanted contact or raids` },
    HateOrThreats: { name: t`Hate or threats`, hint: t`Attacks on a group, or threats of violence` },
    Spam: { name: t`Spam`, hint: t`Unwanted ads, mass mentions or fake engagement` },
    ScamFraud: { name: t`Scam or fraud`, hint: t`Phishing, fake giveaways or money scams` },
    Impersonation: { name: t`Impersonation`, hint: t`Pretending to be you, someone else or Zrzur` },
    MaliciousLinks: { name: t`Malicious links`, hint: t`Links that lead to phishing or harmful sites` },
    Malware: { name: t`Malware`, hint: t`Files or links that try to harm devices` },
    PrivacyViolation: { name: t`Privacy violation`, hint: t`Collecting or misusing people's data` },
    PersonalInformation: { name: t`Sharing personal information`, hint: t`Someone's address, documents or private images without consent` },
    SexualContent: { name: t`Sexual or exploitative content`, hint: t`Unwanted sexual content, or anything involving a minor` },
    SelfHarm: { name: t`Self-harm or suicide`, hint: t`Someone may be at risk` },
    IllegalContent: { name: t`Illegal content`, hint: t`Illegal goods, extortion, hacking or extreme violence` },
    BotAbuse: { name: t`Bot abuse`, hint: t`A bot sends spam, abuses commands or asks for too much` },
    MisleadingApplication: { name: t`Misleading application`, hint: t`An app that misrepresents what it does or where its links go` },
    UnauthorisedContent: { name: t`Unauthorised content`, hint: t`Content shared without the owner's permission` },
    IntellectualProperty: { name: t`Copyright or trademark`, hint: t`Your work or brand used without permission` },
    Underage: { name: t`Under minimum age`, hint: t`The user appears to be too young for Zrzur` },
    Other: { name: t`Something else`, hint: t`Tell us what's wrong in your own words` },
  };
  const subcategory: Record<string, string> = {
    flashing: t`Flashing or harmful: it could cause seizures`,
    targeted: t`Targeted at me or someone else`,
    bullying: t`Bullying`,
    unwanted_contact: t`Unwanted contact`,
    raid: t`Raid`,
    hate_speech: t`Hate speech`,
    violent_threat: t`Threat of violence`,
    violent_extremism: t`Violent extremism`,
    unsolicited_ads: t`Unsolicited ads`,
    mass_mentions: t`Mass mentions`,
    fake_engagement: t`Fake engagement`,
    phishing: t`Phishing`,
    fake_giveaway: t`Fake giveaway`,
    financial_scam: t`Money scam`,
    account_trading: t`Selling or trading accounts`,
    impersonates_me: t`Pretends to be me`,
    impersonates_someone: t`Pretends to be someone else`,
    impersonates_zrzur: t`Pretends to be Zrzur staff`,
    impersonates_zarzour: t`Pretends to be Zrzur staff`,
    doxxing: t`Address or documents`,
    address_or_phone: t`Home address or phone number`,
    private_images: t`Private images`,
    unsolicited: t`Unwanted sexual content`,
    non_consensual: t`Shared without consent`,
    minor_safety: t`Involves a minor`,
    self_harm: t`Self-harm`,
    suicide: t`Suicide`,
    drugs_goods: t`Drugs or illegal goods`,
    extortion: t`Extortion or blackmail`,
    hacking: t`Hacking`,
    violent_gore: t`Extreme violence or gore`,
    spam_dms: t`Sends spam DMs`,
    command_abuse: t`Abuses commands`,
    excessive_permissions: t`Asks for too many permissions`,
    fake_features: t`Fake features`,
    deceptive_oauth: t`Misleading sign-in or permissions`,
    fraudulent_links: t`Fraudulent links`,
    copyright: t`Copyright`,
    trademark: t`Trademark`,
  };
  const kind: Record<string, string> = {
    User: t`User`,
    Message: t`Message`,
    Server: t`Server`,
    Channel: t`Channel`,
    Bot: t`Bot`,
    Application: t`Application`,
    CommunityItem: t`Community design`,
    Attachment: t`Attachment`,
    Invite: t`Invite`,
    Webhook: t`Webhook`,
    DiscoverServer: t`Discover server listing`,
    DiscoverBot: t`Discover bot listing`,
  };
  const receipt: Record<string, string> = {
    Submitted: t`Received`,
    InReview: t`In review`,
    NeedsInfo: t`We need more information`,
    ActionTaken: t`Action taken`,
    NoViolation: t`No violation found`,
    Closed: t`Closed`,
  };
  return { category, subcategory, kind, receipt };
}

function Notice({ children, danger }: { children: string; danger?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={danger ? "warning-circle" : "info"} size={16} color={danger ? palette.danger : palette.muted} />
      </View>
      <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
        {children}
      </AText>
    </View>
  );
}

function ChoiceRow({ title, hint, first, onPress, pressed: selected, testID }: { title: string; hint?: string; first: boolean; onPress: () => void; pressed: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, backgroundColor: pressed || selected ? palette.navSelected : "transparent" })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg}>
          {title}
        </AText>
        {hint ? (
          <AText size={13} line={18} color={palette.muted}>
            {hint}
          </AText>
        ) : null}
      </View>
      <Icon name="caret-right" size={16} color={palette.muted} />
    </Pressable>
  );
}

function Summary({ rows }: { rows: [string, string][] }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ gap: 4 }}>
          <AText size={12} line={16} weight="semibold" color={palette.muted}>
            {k}
          </AText>
          <AText size={14} line={20} color={palette.fg}>
            {v}
          </AText>
        </View>
      ))}
    </View>
  );
}

/**
 * Report to Zrzur Trust & Safety (web ReportContent): reason, optional
 * sub-reason, details, a summary, then a reference to keep. Cancel never
 * sends anything; Back keeps what was entered; it sends once.
 */
export function ReportFlow({ spec, onClose, onStepChange }: { spec: ReportSpec; onClose: () => void; onStepChange?: (step: ReportStep) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSafetyLabels();
  const [step, setStepState] = useState<ReportStep>("reason");
  const [reasons, setReasons] = useState<{ state: "loading" | "error" | "ready"; list: ReasonOption[] }>({ state: "loading", list: [] });
  const [tick, setTick] = useState(0);
  const [category, setCategory] = useState<string>();
  const [sub, setSub] = useState<string>();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<Receipt>();

  useEffect(() => {
    let alive = true;
    client.api
      .get(`/safety/reasons/${spec.kind}` as never)
      .then((list) => alive && setReasons({ state: "ready", list: (list as unknown as ReasonOption[]) ?? [] }))
      .catch(() => alive && setReasons({ state: "error", list: [] }));
    return () => {
      alive = false;
    };
  }, [client, spec.kind, tick]);

  const setStep = (next: ReportStep) => {
    setStepState(next);
    onStepChange?.(next);
  };
  const option = reasons.list.find((r) => r.category === category);
  const subs = offeredSubs(option, spec.kind);
  const title =
    (
      {
        User: t`Report user`,
        Message: t`Report message`,
        Server: t`Report server`,
        Channel: t`Report channel`,
        Bot: t`Report bot`,
        Application: t`Report application`,
        CommunityItem: spec.effect ? t`Report this effect` : t`Report design`,
        Attachment: t`Report attachment`,
        Invite: t`Report invite`,
        Webhook: t`Report webhook`,
        DiscoverServer: t`Report Discover listing`,
        DiscoverBot: t`Report Discover listing`,
      } as Record<string, string>
    )[spec.kind] ?? t`Report`;

  const pick = (entry: ReasonOption) => {
    setCategory(entry.category);
    if (sub && !entry.subcategories?.includes(sub)) setSub(undefined);
    setError(undefined);
    setStep(afterReason(entry, spec.kind));
  };
  const back = () => {
    setError(undefined);
    setStep(stepBack(step, subs.length > 0));
  };
  const send = async () => {
    if (busy || receipt || !category) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.api.post(
        "/safety/reports" as never,
        {
          target: { kind: spec.kind, id: spec.id, message_id: spec.messageId, server_id: spec.serverId },
          category,
          subcategory: sub,
          description: description.trim() || undefined,
        } as never,
        { retries: 0 },
      );
      setReceipt(result as unknown as Receipt);
      setStep("done");
    } catch (failure) {
      switch (errorType(failure)) {
        case "NotFound":
          setError(t`This can't be reported. It may have been deleted, or you can't see it any more.`);
          break;
        case "CannotReportYourself":
          setError(t`You can't report yourself or your own content.`);
          break;
        case "TooManyReports":
          setError(t`You've sent a lot of reports today. Try again tomorrow, or choose an urgent reason if someone is in danger.`);
          break;
        default:
          setError(describeError(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  const target = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
      {spec.image ? <Image source={{ uri: spec.image }} style={{ width: 40, height: 40, borderRadius: 20 }} accessibilityIgnoresInvertColors /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText size={12} line={16} color={palette.muted}>
          {labels.kind[spec.kind] ?? spec.kind}
        </AText>
        <AText size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={2}>
          {spec.label || spec.id}
        </AText>
      </View>
    </View>
  );

  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;
  if (step === "reason") {
    body = (
      <>
        {target}
        <AText size={15} line={22} color={palette.fg2}>
          {t`What's the problem? Your report goes to Zrzur's Trust & Safety team, not to the server's moderators, and the reported person won't know it was you.`}
        </AText>
        {reasons.state === "loading" ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <ActivityIndicator color={palette.muted} />
            <AText size={14} line={20} color={palette.muted}>
              {t`Loading…`}
            </AText>
          </View>
        ) : reasons.state === "error" ? (
          <View style={{ gap: 8 }}>
            <Notice danger>{t`The reasons couldn't be loaded.`}</Notice>
            <View style={{ flexDirection: "row" }}>
              <StepButton testID="report-retry" label={t`Try again`} onPress={() => setTick((n) => n + 1)} />
            </View>
          </View>
        ) : (
          <RowGroup>
            {reasons.list.map((entry, i) => (
              <ChoiceRow
                key={entry.category}
                testID={`report-reason-${entry.category}`}
                first={i === 0}
                pressed={category === entry.category}
                title={labels.category[entry.category]?.name ?? entry.category}
                hint={labels.category[entry.category]?.hint}
                onPress={() => pick(entry)}
              />
            ))}
          </RowGroup>
        )}
      </>
    );
    actions = <StepButton testID="report-cancel" label={t`Cancel`} onPress={onClose} />;
  } else if (step === "sub" && option) {
    body = (
      <>
        <AText size={15} line={22} color={palette.fg2}>
          <AText size={15} line={22} weight="semibold" color={palette.fg}>
            {labels.category[option.category]?.name ?? option.category}
          </AText>
          {` · ${t`Which describes it best?`}`}
        </AText>
        <RowGroup>
          {subs.map((value, i) => (
            <ChoiceRow
              key={value}
              testID={`report-sub-${value}`}
              first={i === 0}
              pressed={sub === value}
              title={labels.subcategory[value] ?? value}
              onPress={() => {
                setSub(value);
                setStep("details");
              }}
            />
          ))}
        </RowGroup>
      </>
    );
    actions = (
      <>
        <StepButton testID="report-back" label={t`Back`} onPress={back} />
        <StepButton
          testID="report-skip"
          label={t`Skip`}
          onPress={() => {
            setSub(undefined);
            setStep("details");
          }}
        />
      </>
    );
  } else if (step === "details") {
    body = (
      <>
        {category === "SelfHarm" ? <Notice danger>{t`If someone is in immediate danger, contact your local emergency services now.`}</Notice> : null}
        <TextField
          testID="report-description"
          multiline
          maxLength={REPORT_MAX}
          value={description}
          onChangeText={setDescription}
          label={option?.needs_description ? t`What happened? (required)` : t`Anything else we should know? (optional)`}
          placeholder={t`Describe what happened. Don't paste private information you don't need to share.`}
          style={{ minHeight: 112, lineHeight: 22, textAlignVertical: "top" }}
        />
        <AText size={12} line={16} color={palette.muted} style={{ alignSelf: "flex-end" }}>
          {`${description.length} / ${REPORT_MAX}`}
        </AText>
        <Notice>{t`We automatically include the reported content and, for messages, a few messages around it. You don't need to describe anything graphic.`}</Notice>
      </>
    );
    actions = (
      <>
        <StepButton testID="report-back" label={t`Back`} onPress={back} />
        <StepButton testID="report-next" label={t`Next`} tone="primary" disabled={!detailsOk(option, sub, description)} onPress={() => setStep("review")} />
      </>
    );
  } else if (step === "review") {
    const reason = `${category ? (labels.category[category]?.name ?? category) : ""}${sub ? ` · ${labels.subcategory[sub] ?? sub}` : ""}`;
    body = (
      <>
        {target}
        <Summary rows={[[t`Reason`, reason], ...(description.trim() ? ([[t`Details`, description.trim()]] as [string, string][]) : [])]} />
        <Notice>{t`Reporting doesn't remove anything by itself. A reviewer checks the report against the Zrzur guidelines.`}</Notice>
      </>
    );
    actions = (
      <>
        <StepButton testID="report-back" label={t`Back`} onPress={back} disabled={busy} />
        <StepButton testID="report-send" label={t`Send report`} tone="danger" busy={busy} onPress={() => void send()} />
      </>
    );
  } else if (step === "done" && receipt) {
    body = (
      <>
        <Notice>{receipt.existing ? t`You already reported this. Your earlier report is still being handled.` : t`Thanks. Your report was sent to Zrzur Trust & Safety.`}</Notice>
        <Summary
          rows={[
            [t`Reference`, receipt.reference],
            [t`Status`, labels.receipt[receipt.status] ?? receipt.status],
          ]}
        />
        <AText size={14} line={20} color={palette.fg2}>
          {t`You can follow it under Settings → Reports & standing.`}
        </AText>
      </>
    );
    actions = (
      <>
        <StepButton
          testID="report-mine"
          label={t`My reports`}
          onPress={() => {
            onClose();
            router.push({ pathname: "/user-settings/[section]", params: { section: "reports" } });
          }}
        />
        <StepButton testID="report-done" label={t`Done`} tone="primary" onPress={onClose} />
      </>
    );
  }

  return (
    <View testID="report-flow" style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="flag" size={20} color={palette.danger} />
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AText>
      </View>
      {body}
      <StepError message={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>{actions}</View>
    </View>
  );
}

/** The report flow in a sheet of its own, for screens outside a profile (messages, servers) */
export function ReportSheet({ spec, onClose }: { spec: ReportSpec | null; onClose: () => void }) {
  const [step, setStep] = useState<ReportStep>("reason");
  // past the first step a tap outside keeps what was entered (web: persistent)
  const persistent = step !== "reason" && step !== "done";
  const close = () => {
    setStep("reason");
    onClose();
  };
  return (
    <Sheet visible={!!spec} onClose={persistent ? () => {} : close} testID="report-sheet">
      {spec ? <ReportFlow key={spec.id} spec={spec} onClose={close} onStepChange={setStep} /> : null}
    </Sheet>
  );
}
