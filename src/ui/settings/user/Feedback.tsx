import { useLingui } from "@lingui/react/macro";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Chip } from "@/ui/kit/Chip";

import { InlineError, SettingsPage, SettingsSection, SmallButton } from "../parts";
import { NavRow, Pill, Tabs } from "./userParts";
import { SAFETY_CONTACT, STANDING_LEVELS, bugReady, decisionReference } from "./userPrefs";
import { openExternal } from "@/ui/kit/openLink";

const GITHUB = "https://github.com/zrzur";

type Picked = { uri: string; name: string; type: string };
type Bug = { _id: string; kind: string; title: string; status: string; reviewer_note?: string | null; created_at: number };

type Level = (typeof STANDING_LEVELS)[number];
type Category = "Harassment" | "HateOrThreats" | "Spam" | "ScamFraud" | "Impersonation" | "MaliciousLinks" | "Malware" | "PrivacyViolation" | "PersonalInformation" | "SexualContent" | "SelfHarm" | "IllegalContent" | "BotAbuse" | "MisleadingApplication" | "UnauthorisedContent" | "IntellectualProperty" | "Underage" | "Other";
type Entry = {
  action_id: string;
  kind: string;
  category: Category;
  public_reason: string;
  created_at: number;
  expires_at?: number | null;
  active: boolean;
  revoked: boolean;
  appealable: boolean;
  appeal_status?: "Pending" | "Upheld" | "Overturned" | null;
  appeal_note?: string | null;
  facts?: string;
  ground?: { type: "Law"; law: string; provision: string } | { type: "Terms"; rule: string };
  automated_detection?: boolean;
  automated_decision?: boolean;
  territorial_scope?: string;
  basis?: "Unknown" | "Report" | "Notice" | "OwnInitiative";
};
type Standing = { level: Level; entries: Entry[]; out_of_court_body?: string | null };
type Receipt = { _id: string; reference: string; target_kind: string; category: Category; status: string; info_request?: string | null; public_note?: string | null; created_at: number };

function when(ms: number, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

/** Translated Trust & Safety names (web: safety/labels.tsx) */
function useSafetyLabels() {
  const { t } = useLingui();
  const category: Record<Category, string> = {
    Harassment: t`Harassment or bullying`,
    HateOrThreats: t`Hate or threats`,
    Spam: t`Spam`,
    ScamFraud: t`Scam or fraud`,
    Impersonation: t`Impersonation`,
    MaliciousLinks: t`Malicious links`,
    Malware: t`Malware`,
    PrivacyViolation: t`Privacy violation`,
    PersonalInformation: t`Sharing personal information`,
    SexualContent: t`Sexual or exploitative content`,
    SelfHarm: t`Self-harm or suicide`,
    IllegalContent: t`Illegal content`,
    BotAbuse: t`Bot abuse`,
    MisleadingApplication: t`Misleading application`,
    UnauthorisedContent: t`Unauthorised content`,
    IntellectualProperty: t`Copyright or trademark`,
    Underage: t`Under minimum age`,
    Other: t`Something else`,
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
  const action: Record<string, string> = {
    Warning: t`Warning`,
    RemoveMessage: t`Message removed`,
    SuspendAccount: t`Account suspended`,
    BanAccount: t`Account banned`,
    DisableBot: t`Bot disabled`,
    RemoveDiscoverListing: t`Removed from Discover`,
    SuspendCommunityItem: t`Design suspended`,
    SuspendCreator: t`Creator access paused`,
  };
  const appeal: Record<string, string> = { Pending: t`Appeal pending`, Upheld: t`Appeal declined`, Overturned: t`Appeal accepted` };
  const standing: Record<Level, { name: string; description: string }> = {
    Good: { name: t`All good`, description: t`Thanks for following the Zrzur guidelines.` },
    Limited: { name: t`Limited`, description: t`You have a recent violation. Keep to the guidelines and it will expire.` },
    VeryLimited: { name: t`Very limited`, description: t`You have several recent violations.` },
    AtRisk: { name: t`At risk`, description: t`Further violations may lead to a suspension.` },
    Suspended: { name: t`Suspended`, description: t`Your account is suspended.` },
  };
  const bug: Record<string, string> = {
    Open: t`Open`,
    Triaged: t`Triaged`,
    NeedsInfo: t`Needs more info`,
    Confirmed: t`Confirmed`,
    Fixed: t`Fixed`,
    Duplicate: t`Duplicate`,
    NotABug: t`Not a bug`,
  };
  return { category, kind, receipt, action, appeal, standing, bug };
}

const AREA = { minHeight: 96, textAlignVertical: "top" as const };

/** Dialog "Report a bug" (web: BugReportDialog), with "My reports" under it */
export function BugReportSheet({ onClose, beta = [] }: { onClose: () => void; beta?: string[] }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSafetyLabels();
  const [kind, setKind] = useState<"bug" | "security" | "feedback">("bug");
  const [feature, setFeature] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [device, setDevice] = useState(() => [Device.modelName, `${Platform.OS} ${Platform.Version}`].filter(Boolean).join(", ").slice(0, 120));
  const [shots, setShots] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<Bug[]>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    (client.api.get("/bugs/@me" as never) as Promise<Bug[]>).then((list) => live && setMine(list ?? [])).catch(() => live && setMine([]));
    return () => {
      live = false;
    };
  }, [client, tick]);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.9 });
    if (result.canceled) return;
    setShots(result.assets.slice(0, 4).map((a, i) => ({ uri: a.uri, name: a.fileName ?? `screenshot-${i + 1}.jpg`, type: a.mimeType ?? "image/jpeg" })));
  };

  const send = async () => {
    setBusy(true);
    setError(undefined);
    setSent(false);
    try {
      const attachments: string[] = [];
      for (const shot of shots) attachments.push(await client.uploadFile("attachments", shot as unknown as File));
      await client.api.post(
        "/bugs/" as never,
        {
          kind,
          title: title.trim(),
          description: description.trim(),
          steps: steps.trim() || undefined,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          platform: Platform.OS,
          device: device.trim() || undefined,
          app_version: Constants.expoConfig?.version,
          feature: kind === "feedback" && feature ? feature : undefined,
          attachments,
        } as never,
      );
      setSent(true);
      setTitle("");
      setDescription("");
      setSteps("");
      setExpected("");
      setActual("");
      setShots([]);
      setTick((n) => n + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const kinds: { value: typeof kind; label: string }[] = [
    { value: "bug", label: t`Bug` },
    { value: "security", label: t`Security issue (private)` },
    ...(beta.length ? [{ value: "feedback" as const, label: t`Beta feedback` }] : []),
  ];

  return (
    <Sheet visible onClose={onClose} testID="bug-report">
      <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {t`Report a bug`}
      </AText>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`Type`}
      </AText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t`Type`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {kinds.map((k) => (
          <Chip key={k.value} radio testID={`bug-kind-${k.value}`} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </View>
      {kind === "feedback" ? (
        <>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Beta feature`}
          </AText>
          <View accessibilityRole="radiogroup" accessibilityLabel={t`Beta feature`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["", ...beta].map((f) => (
              <Chip key={f || "general"} radio label={f || t`General`} selected={feature === f} onPress={() => setFeature(f)} />
            ))}
          </View>
        </>
      ) : null}
      {kind === "security" ? (
        <AText size={13} line={18} color={palette.fg2}>
          {t`Only you and Zrzur's security reviewers can read a security report. Nothing about it is shown on your profile.`}
        </AText>
      ) : null}
      <TextField label={t`Title`} value={title} onChangeText={setTitle} maxLength={120} testID="bug-title" />
      <TextField label={t`What happened?`} value={description} onChangeText={setDescription} maxLength={4000} multiline style={AREA} testID="bug-description" />
      <TextField label={t`Steps to reproduce`} value={steps} onChangeText={setSteps} maxLength={4000} multiline style={AREA} />
      <TextField label={t`Expected`} value={expected} onChangeText={setExpected} maxLength={2000} multiline style={AREA} />
      <TextField label={t`Actual`} value={actual} onChangeText={setActual} maxLength={2000} multiline style={AREA} />
      <TextField label={t`Device (optional)`} value={device} onChangeText={setDevice} maxLength={120} placeholder={t`For example: Windows 11, Firefox`} />
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`Screenshots (up to 4)`}
      </AText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SmallButton label={t`Choose images`} onPress={() => void pick()} testID="bug-shots" />
        <AText size={13} line={18} color={palette.muted}>
          {shots.length ? t`Chosen: ${shots.length}` : t`None chosen`}
        </AText>
      </View>
      {sent ? (
        <AText size={14} line={20} color={palette.online} accessibilityRole="alert">
          {t`Thanks! Your report was sent. Reviewers will look at it.`}
        </AText>
      ) : null}
      <InlineError message={error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <SmallButton label={t`Close`} onPress={onClose} />
        <SmallButton primary label={t`Send report`} disabled={busy || !bugReady({ title, description })} onPress={() => void send()} testID="bug-send" />
      </View>
      <AText size={16} line={22} weight="semibold" color={palette.header} accessibilityRole="header">
        {t`My reports`}
      </AText>
      {mine === undefined ? <ActivityIndicator color={palette.muted} /> : null}
      {mine && mine.length === 0 ? (
        <AText size={14} line={20} color={palette.muted}>
          {t`You haven't sent any reports yet.`}
        </AText>
      ) : null}
      {mine?.map((b) => (
        <View key={b._id} style={{ borderRadius: 12, padding: 12, gap: 8, backgroundColor: palette.field }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <AText size={15} line={20} weight="medium" color={palette.fg} style={{ flexShrink: 1 }}>
              {b.title}
            </AText>
            <Pill tone={b.status === "Fixed" ? "ok" : b.status === "NeedsInfo" ? "warn" : undefined}>{labels.bug[b.status] ?? b.status}</Pill>
            {b.kind === "security" ? <Pill tone="accent">{t`Private`}</Pill> : null}
          </View>
          <AText size={12} line={16} color={palette.muted}>
            {when(b.created_at, i18n.locale)}
          </AText>
          {b.reviewer_note ? (
            <AText size={13} line={18} color={palette.fg2}>
              {`“${b.reviewer_note}”`}
            </AText>
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

/** Tab Feedback: bug dialog and the GitHub links */
function FeedbackTab() {
  const { t } = useLingui();
  const [reporting, setReporting] = useState(false);
  const open = () => void openExternal(GITHUB);
  return (
    <>
      <RowGroup>
        <NavRow
          first
          icon="bug"
          title={t`Report a bug`}
          description={t`Send a bug or a private security report to the Zrzur team and follow its status. Verified reports earn Bug Hunter.`}
          onPress={() => setReporting(true)}
          testID="feedback-report-bug"
        />
      </RowGroup>
      <RowGroup>
        <NavRow first external icon="chat-circle-dots" title={t`Submit feature suggestion`} description={t`Suggest new Zrzur features once the public repository is available.`} onPress={open} />
        <NavRow external icon="list-numbers" title={t`Feedback`} description={t`Submit feedback`} onPress={open} />
        <NavRow external icon="bug" title={t`Bug tracker`} description={t`View currently active bug reports here.`} onPress={open} />
      </RowGroup>
      {reporting ? <BugReportSheet onClose={() => setReporting(false)} beta={[]} /> : null}
    </>
  );
}

/** A label and its text in a decision statement */
function Fact({ label, children }: { label: string; children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <AText size={12} line={16} weight="semibold" color={palette.muted}>
        {label}
      </AText>
      <AText size={13} line={18} color={palette.fg2}>
        {children}
      </AText>
    </View>
  );
}

/** One action on the account, with its statement of reasons and appeal */
function StandingRow({ entry, outOfCourt, onAppealed }: { entry: Entry; outOfCourt?: string | null; onAppealed: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSafetyLabels();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const contact = SAFETY_CONTACT;
  const reference = decisionReference(entry.action_id);
  const ground = entry.ground;
  const rawRule = ground?.type === "Terms" ? ground.rule : "";
  const named = rawRule.startsWith("rule:") ? labels.category[rawRule.slice(5) as Category] : undefined;
  const rule = named ?? (rawRule === "Terms of Service" ? t`Terms of Service` : rawRule);
  const law = ground?.type === "Law" ? ground.law : "";
  const provision = ground?.type === "Law" ? ground.provision : "";
  const yes = t`yes`;
  const no = t`no`;
  const scope = entry.territorial_scope && entry.territorial_scope.toLowerCase() !== "worldwide" ? entry.territorial_scope : t`Worldwide`;

  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.api.post(`/safety/standing/${entry.action_id}/appeal` as never, { statement: text.trim() } as never);
      setOpen(false);
      onAppealed();
    } catch (err) {
      const type = (err as { type?: string; data?: { type?: string } })?.type ?? (err as { data?: { type?: string } })?.data?.type;
      setError(type === "InvalidOperation" ? t`This action can't be appealed, or you already appealed it.` : describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={`standing-${entry.action_id}`} style={{ borderRadius: 14, padding: 16, gap: 8, backgroundColor: palette.field }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <AText size={15} line={20} weight="semibold" color={palette.fg}>
          {labels.action[entry.kind] ?? entry.kind}
        </AText>
        <Pill>{labels.category[entry.category] ?? entry.category}</Pill>
        {entry.revoked ? <Pill tone="ok">{t`Reversed`}</Pill> : entry.active ? <Pill tone="warn">{t`Active`}</Pill> : null}
        {entry.appeal_status ? <Pill tone="accent">{labels.appeal[entry.appeal_status]}</Pill> : null}
      </View>
      <AText size={14} line={20} color={palette.fg}>
        {entry.public_reason}
      </AText>
      <AText size={12} line={16} color={palette.muted}>
        {entry.expires_at ? `${when(entry.created_at, i18n.locale)} · ${t`Ends`} ${when(entry.expires_at, i18n.locale)}` : when(entry.created_at, i18n.locale)}
      </AText>
      <View style={{ gap: 8 }}>
        <Fact label={t`What this followed`}>{entry.basis === "Notice" ? t`A notice of illegal content.` : entry.basis === "OwnInitiative" ? t`Our own review.` : t`A report from another person.`}</Fact>
        <Fact label={t`What happened`}>{entry.facts || entry.public_reason}</Fact>
        <Fact label={t`Ground`}>{ground?.type === "Law" ? t`Illegal under ${law}, ${provision}` : t`Breaks our rules: ${rule}. This is not a finding that it is illegal.`}</Fact>
        <Fact label={t`Automated tools`}>{`${t`Used to find it:`} ${entry.automated_detection ? yes : no} · ${t`Used to decide:`} ${entry.automated_decision ? yes : no}`}</Fact>
        <Fact label={t`Where it applies`}>{scope}</Fact>
        {entry.appealable ? (
          <Fact label={t`How to appeal`}>{t`Use Appeal below. You can appeal for at least 6 months after the decision. If you cannot sign in, write to ${contact} and give the reference ${reference}. A person reviews it.`}</Fact>
        ) : null}
        <Fact label={t`Out-of-court settlement`}>
          {[
            t`You can also take this to a certified out-of-court dispute settlement body of your choice (Article 21 of the Digital Services Act). It does not affect your right to go to court.`,
            t`The European Commission publishes the list of certified bodies on its website.`,
            outOfCourt ? `${t`Zrzur also works with:`} ${outOfCourt}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </Fact>
        <Fact label={t`Questions`}>{contact}</Fact>
      </View>
      {entry.appeal_note ? (
        <AText size={13} line={18} color={palette.fg2}>
          {`${t`Reviewer's answer:`} ${entry.appeal_note}`}
        </AText>
      ) : null}
      {entry.appealable ? (
        open ? (
          <View style={{ gap: 8 }}>
            <TextField
              label={t`Why should we look at this again?`}
              value={text}
              onChangeText={setText}
              maxLength={2000}
              multiline
              style={AREA}
              helper={t`Appealing doesn't lift anything by itself. A person looks at the decision again; where we can, it is someone other than the person who made it.`}
              testID="appeal-text"
            />
            <InlineError message={error} />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <SmallButton label={t`Cancel`} disabled={busy} onPress={() => setOpen(false)} />
              <SmallButton primary label={t`Send appeal`} disabled={busy || text.trim().length < 10} onPress={() => void send()} testID="appeal-send" />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row" }}>
            <SmallButton label={t`Appeal`} onPress={() => setOpen(true)} testID="appeal-open" />
          </View>
        )
      ) : null}
    </View>
  );
}

/** One report the person sent, with the answer box when a reviewer asks */
function ReportRow({ report, onReplied }: { report: Receipt; onReplied: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSafetyLabels();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const reply = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.api.post(`/safety/reports/${report._id}/info` as never, { text: text.trim() } as never);
      setText("");
      onReplied();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const tone = report.status === "InReview" ? "accent" : report.status === "NeedsInfo" ? "warn" : report.status === "ActionTaken" ? "ok" : undefined;
  return (
    <View testID={`report-${report._id}`} style={{ borderRadius: 14, padding: 16, gap: 8, backgroundColor: palette.field }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <AText size={14} line={20} weight="semibold" color={palette.fg} style={{ writingDirection: "ltr" }} selectable>
          {report.reference}
        </AText>
        <Pill>{labels.kind[report.target_kind] ?? report.target_kind}</Pill>
        <Pill tone={tone}>{labels.receipt[report.status] ?? report.status}</Pill>
      </View>
      <AText size={14} line={20} color={palette.fg2}>
        {labels.category[report.category] ?? report.category}
      </AText>
      <AText size={12} line={16} color={palette.muted}>
        {when(report.created_at, i18n.locale)}
      </AText>
      {report.public_note ? (
        <AText size={13} line={18} color={palette.fg2}>
          {report.public_note}
        </AText>
      ) : null}
      {report.status === "NeedsInfo" && report.info_request ? (
        <View style={{ gap: 8 }}>
          <AText size={13} line={18} color={palette.fg2}>
            {`${t`A reviewer asked:`} ${report.info_request}`}
          </AText>
          <TextField label={t`Your answer`} value={text} onChangeText={setText} maxLength={1000} multiline style={AREA} />
          <InlineError message={error} />
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <SmallButton primary label={t`Send`} disabled={busy || !text.trim()} onPress={() => void reply()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Tab Reports & standing (web: ReportsAndStanding) */
function ReportsTab() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSafetyLabels();
  const [standing, setStanding] = useState<{ state: "loading" | "error" | "ready"; data?: Standing }>({ state: "loading" });
  const [reports, setReports] = useState<{ state: "loading" | "error" | "ready"; data?: Receipt[] }>({ state: "loading" });
  const [standingTick, setStandingTick] = useState(0);
  const [reportsTick, setReportsTick] = useState(0);

  useEffect(() => {
    let live = true;
    (client.api.get("/safety/standing" as never) as Promise<Standing>)
      .then((data) => live && setStanding({ state: "ready", data }))
      .catch(() => live && setStanding({ state: "error" }));
    return () => {
      live = false;
    };
  }, [client, standingTick]);
  useEffect(() => {
    let live = true;
    (client.api.get("/safety/reports" as never) as Promise<Receipt[]>)
      .then((data) => live && setReports({ state: "ready", data: data ?? [] }))
      .catch(() => live && setReports({ state: "error" }));
    return () => {
      live = false;
    };
  }, [client, reportsTick]);

  const muted = (text: string) => (
    <AText size={14} line={20} color={palette.muted}>
      {text}
    </AText>
  );
  const retry = (onPress: () => void) => (
    <View style={{ flexDirection: "row" }}>
      <SmallButton label={t`Try again`} onPress={onPress} />
    </View>
  );
  const current = standing.data;
  const levelIndex = current ? STANDING_LEVELS.indexOf(current.level) : -1;

  return (
    <>
      <SettingsSection title={t`Account standing`}>
        {standing.state === "loading" ? muted(t`Loading…`) : null}
        {standing.state === "error" ? (
          <View style={{ gap: 8 }}>
            {muted(t`Your account standing couldn't be loaded.`)}
            {retry(() => {
              setStanding({ state: "loading" });
              setStandingTick((n) => n + 1);
            })}
          </View>
        ) : null}
        {current ? (
          <View style={{ gap: 12 }}>
            <View accessibilityRole="progressbar" accessibilityLabel={t`Standing`} accessibilityValue={{ min: 1, max: 5, now: levelIndex + 1, text: labels.standing[current.level].name }} style={{ flexDirection: "row", gap: 4 }}>
              {STANDING_LEVELS.map((level, i) => (
                <View key={level} style={{ flex: 1, gap: 4 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: i === levelIndex ? (i === 0 ? palette.online : i >= 3 ? palette.danger : palette.idle) : palette.borderStrong }} />
                  <AText size={11} line={14} color={i === levelIndex ? palette.fg : palette.muted} numberOfLines={2}>
                    {labels.standing[level].name}
                  </AText>
                </View>
              ))}
            </View>
            <AText size={14} line={20} color={palette.fg}>
              <AText size={14} line={20} weight="semibold" color={palette.fg}>
                {labels.standing[current.level].name}
              </AText>
              {` — ${labels.standing[current.level].description}`}
            </AText>
            {current.entries.length === 0
              ? muted(t`No actions have been taken on your account.`)
              : current.entries.map((entry) => <StandingRow key={entry.action_id} entry={entry} outOfCourt={current.out_of_court_body} onAppealed={() => setStandingTick((n) => n + 1)} />)}
          </View>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t`Your reports`} description={t`Reports you sent to Zrzur Trust & Safety. The people you report never see your name.`}>
        {reports.state === "loading" ? muted(t`Loading…`) : null}
        {reports.state === "error" ? (
          <View style={{ gap: 8 }}>
            {muted(t`Your reports couldn't be loaded.`)}
            {retry(() => {
              setReports({ state: "loading" });
              setReportsTick((n) => n + 1);
            })}
          </View>
        ) : null}
        {reports.data && reports.data.length === 0 ? muted(t`You haven't reported anything.`) : null}
        {reports.data?.length ? (
          <View style={{ gap: 8 }}>
            {reports.data.map((r) => (
              <ReportRow key={r._id} report={r} onReplied={() => setReportsTick((n) => n + 1)} />
            ))}
          </View>
        ) : null}
      </SettingsSection>
    </>
  );
}

/** Feedback & reports (tabs Feedback | Reports & standing) */
export function FeedbackPage({ tab: initial }: { tab: "feedback" | "reports" }) {
  const { t } = useLingui();
  const [tab, setTab] = useState(initial);
  return (
    <SettingsPage title={t`Feedback & reports`} testID="user-feedback">
      <Tabs
        label={t`Feedback & reports`}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "feedback", title: t`Feedback` },
          { id: "reports", title: t`Reports & standing` },
        ]}
      />
      {tab === "feedback" ? <FeedbackTab /> : <ReportsTab />}
    </SettingsPage>
  );
}
