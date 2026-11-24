import { Trans, useLingui } from "@lingui/react/macro";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorDetails, errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthButton, BackButton, ErrorBox } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { AText, Button, Icon, KeyboardFooter, PressableRow, ScreenHeader, TextField, Toggle, keyboardScrollProps, openExternal, useLeaveGuard } from "@/ui/kit";

import { FlowArt, type FlowArtName } from "./FlowArt";
import { InviteCard } from "./InviteCard";
import { parseInviteCode } from "./inviteLogic";
import {
  NAME_LIMIT,
  type ServerAnswer,
  type ServerTemplate,
  type ServerTemplateId,
  TemplateTimeout,
  type FlowStep,
  defaultServerName,
  landedServer,
  localiseTemplate,
  openingChannel,
  pickableServerTemplates,
  previousStep,
  serverBlueprint,
  tailorServerTemplate,
  withTimeout,
} from "./serverTemplates";

const SERVER_RULES = "https://zrzur.com/legal/server-owner-rules";
const WRITE_TIMEOUT = 20_000;
const UPLOAD_TIMEOUT = 120_000;

type Picked = { uri: string; name: string; type: string };

/** Template titles in the person's language (web: useTemplateTitles) */
function useTemplateTitles(): Record<ServerTemplateId, string> {
  const { t } = useLingui();
  return { custom: t`Start from scratch`, gaming: t`Gaming community`, friends: t`Friends` };
}

/** Channel, category and role names in the person's language (web: useLocalisedTemplate) */
function useTemplateNames(): Record<string, string> {
  const { t } = useLingui();
  return {
    Community: t`Community`,
    General: t`General`,
    announcements: t`announcements`,
    clips: t`clips`,
    "Gaming rooms": t`Gaming rooms`,
    Lobby: t`Lobby`,
    Squad: t`Squad`,
    Friends: t`Friends`,
    photos: t`photos`,
    "Hang out": t`Hang out`,
    Hangout: t`Hangout`,
    "Start here": t`Start here`,
    rules: t`rules`,
    Moderators: t`Moderators`,
    Members: t`Members`,
  };
}

/** One choice on a step (web ServerFlowParts Row): picture, words, caret */
function Row({ art, label, onPress, testID }: { art: FlowArtName; label: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <PressableRow
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      highlight={palette.navSelected}
      delay={0}
      onPress={onPress}
      style={{
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: palette.field,
        overflow: "hidden",
      }}
    >
      <FlowArt name={art} />
      <AText size={15} line={22} weight="semibold" color={palette.fg} style={{ flex: 1 }}>
        {label}
      </AText>
      <Icon name="caret-right" size={16} color={palette.iconMuted} />
    </PressableRow>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <AText size={13} line={20} weight="semibold" color={palette.muted} accessibilityRole="header" style={{ marginTop: 16, marginBottom: 8 }}>
      {children}
    </AText>
  );
}

/**
 * The server as it will look: its picture (or the letters of the name as
 * typed), the name, and the rooms the chosen start builds.
 */
function Preview({ name, icon, template }: { name: string; icon?: Picked; template: ServerTemplate }) {
  const { palette } = useTheme();
  const groups = template.groups.filter((g) => g.rooms.length);
  return (
    <View
      testID="create-preview"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.field, padding: 12, gap: 8 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {icon ? (
          <Image source={{ uri: icon.uri }} style={{ width: 32, height: 32, borderRadius: 10 }} contentFit="cover" />
        ) : (
          <Avatar name={name || "?"} size={32} square />
        )}
        <AText autoDir size={15} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </AText>
      </View>
      {groups.map((group) => (
        <View key={group.key} style={{ gap: 2 }}>
          {group.name ? (
            <AText size={12} line={16} weight="semibold" color={palette.muted} numberOfLines={1}>
              {group.name}
            </AText>
          ) : null}
          {group.rooms.map((room) => (
            <View key={room.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
              <Icon name={room.type === "Voice" ? "speaker-high" : "hash"} size={16} color={palette.iconMuted} />
              <AText size={14} line={20} color={palette.fg2} numberOfLines={1} style={{ flex: 1 }}>
                {room.name}
              </AText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The bar at the foot of a step: Back and the step's main button; it rides on the keyboard */
function Footer({ children, onBack }: { children?: ReactNode; onBack?: () => void }) {
  const { palette } = useTheme();
  return (
    <KeyboardFooter
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingTop: 12,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: palette.borderSubtle,
        backgroundColor: palette.frame,
      }}
    >
      {onBack ? <BackButton onPress={onBack} /> : null}
      {children}
    </KeyboardFooter>
  );
}

/**
 * Create or join a server, all in one page (web: CreateServerFlow and the
 * Join server dialog, then the invite preview): pick a start, say who it is
 * for, make it yours; or paste an invite and see the server before joining.
 * Back keeps what was typed. `code` opens straight on an invite's card.
 */
export function AddServerFlow({ code }: { code?: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const titles = useTemplateTitles();
  const names = useTemplateNames();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<FlowStep>(code ? "invite" : "start");
  const [picked, setPicked] = useState<ServerTemplateId>("custom");
  const [answer, setAnswer] = useState<ServerAnswer>("skip");
  const ownName = (name: string) => t`${name}'s server`;
  const startName = defaultServerName(client.user?.displayName ?? client.user?.username ?? "", ownName);
  const [name, setName] = useState(startName);
  const [icon, setIcon] = useState<Picked>();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | TemplateTimeout | null>(null);
  const [nameCheck, setNameCheck] = useState<string>();

  const [link, setLink] = useState("");
  const [linkCheck, setLinkCheck] = useState<string>();
  const [inviteCode, setInviteCode] = useState(code ?? "");

  /** the servers known before a create that timed out; it may land later */
  const timedOut = useRef<ReadonlySet<string> | undefined>(undefined);

  const template = useMemo(() => localiseTemplate(tailorServerTemplate(picked, answer), names), [picked, answer, names]);
  const typed = name.trim();

  // what was chosen or typed stops Back, the X and the swipe-down with the web's nudge
  const dirty = !busy && ((step === "yours" && (typed !== startName || !!icon || agreed)) || (step === "join" && link.trim() !== ""));
  useLeaveGuard(dirty);

  const back = previousStep(step);
  const goBack = () => {
    if (!back || busy) return;
    setError(null);
    setStep(back);
  };

  async function pickIcon() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
    if (result.canceled) return;
    const a = result.assets[0];
    setIcon({ uri: a.uri, name: a.fileName ?? "icon.jpg", type: a.mimeType ?? "image/jpeg" });
  }

  async function create() {
    if (busy) return;
    if (!typed) return setNameCheck(t`Please fill in this field.`);
    if (!agreed || typed.length > NAME_LIMIT) return;
    const servers = () => client.servers.toList().map((s) => ({ id: s.id, ownerId: s.ownerId }));
    const late = timedOut.current && landedServer(servers(), client.user?.id, timedOut.current);
    if (late) return finish(late.id);
    const known = timedOut.current ?? new Set(servers().map((s) => s.id));
    setBusy(true);
    setError(null);
    try {
      const file = icon ? await withTimeout(() => client.uploadFile("icons", icon as unknown as File), UPLOAD_TIMEOUT) : undefined;
      const server = await withTimeout(
        () => client.servers.createServer({ name: typed, access: "Open", blueprint: serverBlueprint(template, file) } as never),
        WRITE_TIMEOUT,
      );
      setBusy(false);
      finish(server.id);
    } catch (failure) {
      if (failure instanceof TemplateTimeout) {
        timedOut.current = known;
        setError(failure);
      } else setError(toAuthError(failure));
      setBusy(false);
    }
  }

  function finish(serverId: string) {
    const server = client.servers.get(serverId);
    const room = server ? openingChannel(template, server.channels.map((c) => ({ id: c.id, name: c.name ?? "" }))) : undefined;
    // web: the new server opens on its first room people can write in
    router.replace({ pathname: "/server/[id]", params: { id: serverId } });
    if (room) router.push({ pathname: "/channel/[id]", params: { id: room } });
  }

  function cont() {
    const parsed = parseInviteCode(link);
    if (!parsed) return setLinkCheck(t`This is not a valid invite link or code.`);
    setLinkCheck(undefined);
    setInviteCode(parsed);
    setStep("invite");
  }

  const title =
    step === "start" ? t`Make your server` : step === "audience" ? t`Who will gather here?` : step === "yours" ? t`Make it yours` : t`Join a server`;

  const errorBox =
    error instanceof TemplateTimeout ? (
      <ErrorBox message={t`Zrzur did not answer in time.`} />
    ) : error ? (
      <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} />
    ) : null;

  return (
    <View style={{ flex: 1 }}>
      {/* while the server is made, the card stays (no swipe-down) */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <ScreenHeader back={busy ? undefined : back ? goBack : true} modal={!back}>
        <AText size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AText>
      </ScreenHeader>

      {step === "invite" ? (
        <InviteCard code={inviteCode} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 + (step === "start" ? insets.bottom : 0) }} {...keyboardScrollProps}>
            {step === "start" ? (
              <View style={{ flexGrow: 1 }} testID="create-start">
                <AText size={15} line={22} color={palette.fg2} style={{ marginBottom: 16 }}>
                  {t`Your server is where you and your friends hang out. Start from scratch or pick a ready-made one.`}
                </AText>
                <Row
                  art="scratch"
                  label={titles.custom}
                  testID="create-template-custom"
                  onPress={() => {
                    setPicked("custom");
                    setStep("audience");
                  }}
                />
                <SectionTitle>{t`Or start ready-made`}</SectionTitle>
                <View style={{ gap: 8 }}>
                  {pickableServerTemplates().map((entry) => (
                    <Row
                      key={entry.id}
                      art={entry.id === "gaming" ? "gaming" : "friends"}
                      label={titles[entry.id]}
                      testID={`create-template-${entry.id}`}
                      onPress={() => {
                        setPicked(entry.id);
                        setStep("audience");
                      }}
                    />
                  ))}
                </View>
                {/* phones: the page ends with the invite block */}
                <View style={{ marginTop: "auto", paddingTop: 16 }}>
                  <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: palette.borderSubtle, gap: 8 }}>
                    <AText size={15} line={20} weight="semibold" color={palette.fg2} style={{ textAlign: "center" }}>
                      {t`Got an invite?`}
                    </AText>
                    <Button testID="create-join" label={t`Join with an invite`} onPress={() => setStep("join")} fill />
                  </View>
                </View>
              </View>
            ) : step === "audience" ? (
              <View style={{ gap: 8 }} testID="create-audience">
                <Row
                  art="community"
                  label={t`A wider community`}
                  testID="create-answer-community"
                  onPress={() => {
                    setAnswer("community");
                    setStep("yours");
                  }}
                />
                <Row
                  art="people"
                  label={t`Just friends`}
                  testID="create-answer-friends"
                  onPress={() => {
                    setAnswer("friends");
                    setStep("yours");
                  }}
                />
                <Pressable
                  testID="create-answer-skip"
                  accessibilityRole="button"
                  onPress={() => {
                    setAnswer("skip");
                    setStep("yours");
                  }}
                  style={({ pressed }) => ({ alignSelf: "center", marginTop: 12, minHeight: 44, paddingHorizontal: 8, justifyContent: "center", borderRadius: 6, backgroundColor: pressed ? palette.navHover : "transparent" })}
                >
                  <AText size={13} line={20} color={palette.link}>
                    {t`Decide later`}
                  </AText>
                </Pressable>
              </View>
            ) : step === "yours" ? (
              <View style={{ gap: 16 }} testID="create-yours">
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Pressable
                    testID="create-icon"
                    accessibilityRole="button"
                    accessibilityLabel={t`Add a server icon`}
                    disabled={busy}
                    onPress={() => void pickIcon()}
                    style={{ width: 80, height: 80 }}
                  >
                    {icon ? (
                      <Image source={{ uri: icon.uri }} style={{ width: 80, height: 80, borderRadius: 40 }} contentFit="cover" accessibilityIgnoresInvertColors />
                    ) : (
                      <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderStyle: "dashed", borderColor: palette.borderStrong, alignItems: "center", justifyContent: "center", gap: 2 }}>
                        <Icon name="image" size={24} color={palette.iconMuted} />
                      </View>
                    )}
                    {!icon ? (
                      <View style={{ position: "absolute", top: 0, start: 56, width: 24, height: 24, borderRadius: 12, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" }}>
                        <Icon name="plus" size={14} color={palette.onAccent} />
                      </View>
                    ) : null}
                  </Pressable>
                  {icon ? (
                    <Pressable
                      testID="create-icon-remove"
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setIcon(undefined)}
                      style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: "center" }}
                    >
                      <AText size={13} line={20} color={palette.danger}>
                        {t`Remove server icon`}
                      </AText>
                    </Pressable>
                  ) : (
                    <View style={{ minHeight: 44, justifyContent: "center" }}>
                      <AText size={13} line={20} color={palette.muted}>
                        {t`Add a server icon`}
                      </AText>
                    </View>
                  )}
                </View>
                <TextField
                  label={t`Server name`}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setNameCheck(undefined);
                  }}
                  editable={!busy}
                  error={nameCheck}
                  maxLength={NAME_LIMIT}
                  returnKeyType="done"
                  testID="create-name"
                  end={
                    <AText size={12} line={16} color={palette.muted} accessibilityElementsHidden>
                      {`${typed.length}/${NAME_LIMIT}`}
                    </AText>
                  }
                />
                <Preview name={typed} icon={icon} template={template} />
                {/* the whole row is the target; the link stays its own */}
                <Pressable
                  testID="create-rules"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: agreed, disabled: busy }}
                  disabled={busy}
                  onPress={() => setAgreed((v) => !v)}
                  style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <AText size={13} line={20} color={palette.fg2} style={{ flex: 1 }}>
                    <Trans>
                      I agree to{" "}
                      <AText size={13} line={20} color={palette.link} accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => void openExternal(SERVER_RULES)}>
                        Zrzur&apos;s rules for server owners
                      </AText>
                    </Trans>
                  </AText>
                  <Toggle value={agreed} onChange={setAgreed} label={t`Zrzur's rules for server owners`} disabled={busy} testID="create-rules-toggle" />
                </Pressable>
                {busy ? (
                  <AText size={13} line={20} color={palette.fg2} accessibilityLiveRegion="polite">
                    {t`Setting up your server…`}
                  </AText>
                ) : null}
                {errorBox}
              </View>
            ) : (
              <View style={{ gap: 16 }} testID="create-join-step">
                <AText size={15} line={22} color={palette.fg2}>
                  {t`Use a code or invite link`}
                </AText>
                <TextField
                  label={t`Code`}
                  placeholder="invite/abc123"
                  value={link}
                  onChangeText={(v) => {
                    setLink(v);
                    setLinkCheck(undefined);
                  }}
                  error={linkCheck}
                  latin
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={cont}
                  testID="join-invite"
                />
              </View>
            )}
          </ScrollView>
          {step === "yours" ? (
            <Footer onBack={busy ? undefined : goBack}>
              <AuthButton status={busy ? "submitting" : "ready"} disabled={!busy && (!typed || !agreed)} onPress={() => void create()} testID="create-submit">
                {busy ? t`Setting up…` : t`Create`}
              </AuthButton>
            </Footer>
          ) : step === "join" ? (
            <Footer onBack={goBack}>
              <AuthButton disabled={!link.trim()} onPress={cont} testID="join-submit">
                {t`Continue`}
              </AuthButton>
            </Footer>
          ) : step === "audience" ? (
            <Footer onBack={goBack} />
          ) : null}
        </>
      )}
    </View>
  );
}
