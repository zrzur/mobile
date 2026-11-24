import { useLingui } from "@lingui/react/macro";
import type { LobbyAppearance, LobbySection, Server, ServerLobby } from "@zrzur/sdk/solid";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";

import {
  clampStep,
  draftOf,
  isLobbyColour,
  type LobbyDraft,
  type LobbyProblem,
  lobbyBody,
  lobbyProblem,
  MAX_BUTTONS,
  MAX_FAQ,
  MAX_MAIN_CHANNELS,
  MAX_STAFF_ROLES,
  move,
  sameDraft,
  toggleIn,
  withEnabled,
} from "../lobby";
import { ControlRow, InlineError, SaveBar, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { ChipChoice, PickerSheet, RowTool as IconBtn, SelectField, SelectPill } from "./controls";
import { AddButton } from "./WelcomeQuestions";
import { editServer } from "@/ui/server/serverEdit";

type ColourKey = "accent" | "secondary" | "background" | "surface" | "text";
type RangeKey = "blend" | "angle" | "banner_height" | "radius" | "channel_limit" | "newcomer_limit";
type ShowKey = "show_greeting" | "show_member_count" | "show_chat" | "show_invite";
type ChannelTarget = "intro" | "news" | number;
type SheetState = { kind: "colour"; key: ColourKey } | { kind: "channel"; target: ChannelTarget } | null;

const SWATCH_DEFAULT: Record<ColourKey, string> = { background: "#1D1F2D", surface: "#242638", text: "#F0F1F8", accent: "#E0195F", secondary: "#E0195F" };
/** Quick picks in the colour sheet (the lobby's colours are user data) */
const QUICK = ["#E0195F", "#FF7AA8", "#9075FF", "#D462B3", "#64A9FF", "#55DCC8", "#F3B96B", "#F27488", "#3FB37F", "#101116", "#1D1F2D", "#242638", "#F0F1F8", "#FFFFFF"];
/** Stepper steps (no slider package in the app) */
const STEP: Record<RangeKey, number> = { blend: 5, angle: 15, banner_height: 10, radius: 2, channel_limit: 1, newcomer_limit: 1 };

const same = (a?: string, b?: string) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

function Chip({ on, onPress, children, label }: { on: boolean; onPress: () => void; children: ReactNode; label: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: on ? palette.accent : palette.borderStrong, backgroundColor: on ? palette.navSelected : pressed ? palette.navHover : "transparent" })}
    >
      {children}
    </Pressable>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  const { palette } = useTheme();
  return (
    <AText size={12} line={16} color={palette.muted} style={{ alignSelf: "flex-end" }}>
      {`${[...value].length}/${max}`}
    </AText>
  );
}

/** Lobby design (web: LobbySettings + LobbyAppearanceEditor) */
export function LobbyDesignPage({ server, onBack }: { server: Server; onBack: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const manage = server.havePermission("ManageServer");
  const font = fontFamily(i18n.locale);
  const storedJson = useSolid(useCallback(() => JSON.stringify(server.lobby ?? null), [server]));
  const stored = useMemo(() => (JSON.parse(storedJson) ?? undefined) as ServerLobby | undefined, [storedJson]);
  const base = useMemo(() => draftOf(stored), [stored]);
  const channelJson = useSolid(useCallback(() => JSON.stringify(server.channels.filter((c) => !c.isVoice).map((c) => ({ id: c.id, name: c.name }))), [server]));
  const channels = useMemo(() => JSON.parse(channelJson) as { id: string; name: string }[], [channelJson]);
  const roleJson = useSolid(useCallback(() => JSON.stringify(server.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour }))), [server]));
  const roles = useMemo(() => JSON.parse(roleJson) as { id: string; name: string; colour?: string }[], [roleJson]);

  const [draft, setDraft] = useState<LobbyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string>();
  const [sheet, setSheet] = useState<SheetState>(null);
  const layoutChoices = [
    { value: "Split", label: t`Main column and sidebar` },
    { value: "Single", label: t`Single column` },
  ];

  const d = draft ?? base;
  const dirty = !!draft && !sameDraft(draft, base);
  const problemCode = lobbyProblem(d);
  const problemText: Record<LobbyProblem, string> = {
    colour: t`Use a six-digit colour such as #E0195F.`,
    contrast: t`Choose text and background colours with at least 4.5:1 contrast.`,
    buttons: t`Complete every button label and channel.`,
    faq: t`Complete every question and answer.`,
  };
  const problem = problemCode ? problemText[problemCode] : undefined;

  const update = (patch: Partial<LobbyDraft>) => {
    setDraft({ ...d, ...patch });
    setNotice(false);
  };
  const setLook = (patch: Partial<LobbyAppearance>) => update({ appearance: { ...d.appearance, ...patch } });
  const setColour = (key: ColourKey, value: string) => {
    const v = value.trim();
    if (key === "accent") update({ accent: v });
    else setLook({ [key]: v || undefined });
  };
  const colourOf = (key: ColourKey) => (key === "accent" ? d.accent : (d.appearance[key] ?? ""));

  const save = async () => {
    if (saving) return false;
    if (!dirty) return true;
    if (problem) {
      setError(problem);
      return false;
    }
    setSaving(true);
    setError(undefined);
    try {
      await editServer(server, (s) => ({ lobby: lobbyBody(d, s.lobby) }));
      setDraft(null);
      setNotice(true);
      return true;
    } catch (err) {
      setError(describeError(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** auto-save: only `enabled` of the stored lobby; other edits stay */
  const toggleEnabled = async (on: boolean) => {
    setEnabling(true);
    setEnableError(undefined);
    try {
      await editServer(server, (s) => ({ lobby: withEnabled(s.lobby, on) }));
      if (draft) setDraft({ ...draft, enabled: on });
    } catch (err) {
      setEnableError(describeError(err));
    } finally {
      setEnabling(false);
    }
  };

  const ro = manage ? undefined : t`Manage server`;
  const presets = [
    { name: t`Raspberry`, accent: "#E0195F", secondary: "#FF7AA8" },
    { name: t`Violet`, accent: "#9075FF", secondary: "#D462B3" },
    { name: t`Ocean`, accent: "#64A9FF", secondary: "#55DCC8" },
    { name: t`Sunset`, accent: "#F3B96B", secondary: "#F27488" },
  ];
  const appTheme = !d.accent && Object.keys(d.appearance).length === 0;
  const colourFields: { key: ColourKey; label: string }[] = [
    { key: "accent", label: t`Accent colour` },
    { key: "secondary", label: t`Gradient colour` },
    { key: "background", label: t`Page background` },
    { key: "surface", label: t`Card background` },
    { key: "text", label: t`Text colour` },
  ];
  const ranges: { key: RangeKey; label: string; min: number; max: number; fallback: number; format: (n: number) => string }[] = [
    { key: "blend", label: t`Colour intensity`, min: 0, max: 100, fallback: 28, format: (n) => `${n}%` },
    { key: "angle", label: t`Gradient angle`, min: 0, max: 360, fallback: 120, format: (n) => `${n}°` },
    { key: "banner_height", label: t`Banner height`, min: 100, max: 360, fallback: 208, format: (n) => `${n}px` },
    { key: "radius", label: t`Corner radius`, min: 0, max: 28, fallback: 14, format: (n) => `${n}px` },
    { key: "channel_limit", label: t`Channels shown`, min: 1, max: 9, fallback: 6, format: (n) => String(n) },
    { key: "newcomer_limit", label: t`New members shown`, min: 1, max: 24, fallback: 12, format: (n) => String(n) },
  ];
  const shows: { key: ShowKey; icon: IconName; label: string; line: string }[] = [
    { key: "show_greeting", icon: "hand-waving", label: t`Personal greeting`, line: t`Welcome, name! above the cards.` },
    { key: "show_member_count", icon: "users-three", label: t`Member count`, line: t`How many people are in the server.` },
    { key: "show_chat", icon: "chat-circle", label: t`Open chat button`, line: t`Takes people straight to the conversation.` },
    { key: "show_invite", icon: "user-plus", label: t`Invite people button`, line: t`Lets members invite their friends.` },
  ];
  const sectionInfo: Record<LobbySection, { icon: IconName; title: string; line: string }> = {
    Start: { icon: "list-checks", title: t`Start here`, line: t`Steps for new members that tick themselves off.` },
    News: { icon: "megaphone", title: t`Latest news`, line: t`The newest message of your announcements.` },
    About: { icon: "info", title: t`About`, line: t`Your welcome text.` },
    Live: { icon: "speaker-high", title: t`Live now`, line: t`Voice rooms with people in them.` },
    Channels: { icon: "hash", title: t`Main channels`, line: t`Where to talk, with how busy each one is.` },
    Questions: { icon: "question", title: t`Questions and answers`, line: t`Answers to what new members ask most.` },
    Newcomers: { icon: "user-plus", title: t`New this week`, line: t`Who joined in the last seven days.` },
    Team: { icon: "shield", title: t`Who runs it`, line: t`The owner and the roles you pick.` },
  };
  const densityName = { Comfortable: t`Comfortable`, Compact: t`Compact` };
  const bannerName = { Server: t`Server banner`, Gradient: t`Colour gradient`, Hidden: t`Hidden` };
  const channelName = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `#${c.name}` : t`Automatic`;
  };
  const channelOptions = [{ value: "", label: t`Automatic` }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))];
  const target = sheet?.kind === "channel" ? sheet.target : null;
  const pickedChannel = target === "intro" ? d.intro_channel : target === "news" ? d.news_channel : typeof target === "number" ? (d.actions[target]?.channel ?? "") : "";
  const colourSheet = sheet?.kind === "colour" ? colourFields.find((f) => f.key === sheet.key) : undefined;

  return (
    <SettingsPage
      title={t`Lobby design`}
      backLabel={t`Joining`}
      onBack={onBack}
      testID="lobby-design"
      description={t`The first page of your server: what it is about, what to do first and who runs it.`}
      footer={manage ? <SaveBar dirty={dirty} saving={saving} error={problem ?? error} onReset={() => (setDraft(null), setError(undefined))} onSave={() => void save()} /> : null}
    >
      <View style={{ gap: 12 }}>
        {ro ? (
          <AText size={13} line={18} color={palette.fg2}>
            {t`You can see this but not change it. It needs the permission "${ro}".`}
          </AText>
        ) : null}
        <View style={ro ? { opacity: 0.6 } : undefined} pointerEvents={ro ? "none" : "auto"}>
          <RowGroup>
            <ControlRow
              first
              icon="house"
              title={t`Show the lobby`}
              description={t`On: everyone sees a Lobby row and the server opens on it. Off: nobody sees it; you can still edit and preview it here.`}
              control={<Toggle label={t`Show the lobby`} value={base.enabled} disabled={enabling || !manage} onChange={(on) => void toggleEnabled(on)} testID="lobby-enabled" />}
            />
            <Pressable
              testID="lobby-save-open"
              accessibilityRole="button"
              disabled={saving}
              onPress={async () => {
                // no lobby screen in the app yet: save, then go back
                if (await save()) onBack();
              }}
            >
              <ControlRow icon="eye" title={t`Save and open lobby`} control={<Icon name="caret-right" size={16} color={palette.iconMuted} />} />
            </Pressable>
          </RowGroup>
        </View>
        <InlineError message={enableError} />
      </View>

      {notice && !dirty ? (
        <AText size={13} line={18} color={palette.fg2} accessibilityLiveRegion="polite" testID="lobby-saved">
          {t`Lobby settings saved. Your members now see this design.`}
        </AText>
      ) : null}

      <SettingsSection title={t`Design`} description={t`Make the lobby yours. Everything here shows in the lobby after saving.`} readOnly={ro}>
        <View accessibilityLabel={t`Colour presets`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[...presets.map((p) => ({ ...p, on: same(d.accent, p.accent) && same(d.appearance.secondary, p.secondary) })), { name: t`App theme`, accent: "", secondary: "", on: appTheme }].map((p) => (
            <Pressable
              key={p.name}
              testID={`lobby-preset-${p.accent || "app"}`}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              accessibilityState={{ selected: p.on }}
              aria-pressed={p.on}
              onPress={() => (p.accent ? update({ accent: p.accent, appearance: { ...d.appearance, secondary: p.secondary } }) : update({ accent: "", appearance: {} }))}
              style={{ flexBasis: 100, flexGrow: 1, maxWidth: 160, padding: 8, gap: 8, borderRadius: 12, borderWidth: 2, borderColor: p.on ? palette.accent : palette.borderStrong }}
            >
              {/* the swatches show the preset's own colours: lobby colours are server content, not app tokens */}
              {p.accent ? (
                <View style={{ height: 40, borderRadius: 8, flexDirection: "row", overflow: "hidden" }}>
                  <View style={{ flex: 1, backgroundColor: p.accent }} />
                  <View style={{ flex: 1, backgroundColor: p.secondary }} />
                </View>
              ) : (
                <View style={{ height: 40, borderRadius: 8, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.fieldBorder }} />
              )}
              {p.on ? (
                <View style={{ position: "absolute", top: 12, end: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.frame, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check-circle" size={20} color={palette.accentText} />
                </View>
              ) : null}
              <AText size={13} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ paddingHorizontal: 4 }}>
                {p.name}
              </AText>
            </Pressable>
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title={t`Colours`} description={t`Empty fields follow the theme. Text keeps 4.5:1 contrast.`} readOnly={ro}>
        <RowGroup>
          {colourFields.map((f, i) => {
            const value = colourOf(f.key);
            const label = f.label;
            return (
              <View key={f.key} style={{ paddingVertical: 12, paddingHorizontal: 12, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                <AText size={15} line={20} weight="medium" color={palette.fg}>
                  {label}
                </AText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable
                    testID={`lobby-swatch-${f.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={t`Pick ${label}`}
                    onPress={() => setSheet({ kind: "colour", key: f.key })}
                    style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: isLobbyColour(value) ? value : SWATCH_DEFAULT[f.key] }}
                  />
                  <TextInput
                    testID={`lobby-hex-${f.key}`}
                    accessibilityLabel={t`${label} hex`}
                    value={value}
                    onChangeText={(v) => setColour(f.key, v)}
                    maxLength={7}
                    placeholder={t`Automatic`}
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.frame, borderWidth: 1, borderColor: value && !isLobbyColour(value) ? palette.danger : palette.fieldBorder, color: palette.fg, fontSize: 16, lineHeight: 20, fontFamily: font, writingDirection: "ltr", textAlign: "left" }}
                  />
                  <IconBtn icon="arrow-counter-clockwise" label={t`Reset ${label}`} disabled={!value} onPress={() => setColour(f.key, "")} />
                </View>
              </View>
            );
          })}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Layout`} readOnly={ro}>
        <View style={{ gap: 16 }}>
          <View testID="lobby-layout" style={{ gap: 4 }}>
            <ChipChoice label={t`Arrangement`} value={d.appearance.layout ?? "Split"} options={layoutChoices} onChange={(v) => setLook({ layout: v as LobbyAppearance["layout"] })} />
            <AText size={13} line={20} color={palette.muted}>
              {t`Cards in two columns or one below the other.`}
            </AText>
          </View>
          <View testID="lobby-density" style={{ gap: 4 }}>
            <ChipChoice
              label={t`Spacing`}
              value={d.appearance.density ?? "Comfortable"}
              options={[
                { value: "Comfortable", label: densityName.Comfortable },
                { value: "Compact", label: densityName.Compact },
              ]}
              onChange={(v) => setLook({ density: v as LobbyAppearance["density"] })}
            />
            <AText size={13} line={20} color={palette.muted}>
              {t`Room between cards and inside them.`}
            </AText>
          </View>
          <View testID="lobby-banner" style={{ gap: 4 }}>
            <ChipChoice
              label={t`Banner`}
              value={d.appearance.banner_mode ?? "Server"}
              options={[
                { value: "Server", label: bannerName.Server },
                { value: "Gradient", label: bannerName.Gradient },
                { value: "Hidden", label: bannerName.Hidden },
              ]}
              onChange={(v) => setLook({ banner_mode: v as LobbyAppearance["banner_mode"] })}
            />
            <AText size={13} line={20} color={palette.muted}>
              {t`The picture at the top of the lobby.`}
            </AText>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t`Sizes`} readOnly={ro}>
        <RowGroup>
          {ranges.map((r, i) => {
            const value = d.appearance[r.key] ?? r.fallback;
            const label = r.label;
            const step = (by: number) => setLook({ [r.key]: clampStep(value + by * STEP[r.key], r.min, r.max) });
            return (
              <View
                key={r.key}
                testID={`lobby-${r.key}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 56, paddingVertical: 4, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}
              >
                <AText size={15} line={20} weight="medium" color={palette.fg} style={{ flex: 1 }}>
                  {label}
                </AText>
                <IconBtn icon="minus" label={t`Decrease ${label}`} disabled={value <= r.min} onPress={() => step(-1)} testID={`lobby-${r.key}-down`} />
                <AText size={15} line={20} weight="semibold" color={palette.fg} style={{ minWidth: 56, textAlign: "center" }}>
                  {r.format(value)}
                </AText>
                <IconBtn icon="plus" label={t`Increase ${label}`} disabled={value >= r.max} onPress={() => step(1)} testID={`lobby-${r.key}-up`} />
              </View>
            );
          })}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Shown in the lobby`} readOnly={ro}>
        <RowGroup>
          {shows.map((s, i) => (
            <ControlRow
              key={s.key}
              first={i === 0}
              icon={s.icon}
              title={s.label}
              description={s.line}
              control={<Toggle label={s.label} value={d.appearance[s.key] !== false} onChange={(on) => setLook({ [s.key]: on })} testID={`lobby-${s.key}`} />}
            />
          ))}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Welcome`} readOnly={ro}>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <TextField
              label={t`Tagline`}
              value={d.tagline}
              maxLength={120}
              placeholder={t`Where people who love games meet`}
              helper={t`One line under the server name. Empty: the server description.`}
              onChangeText={(v) => update({ tagline: v })}
              testID="lobby-tagline"
            />
            <Counter value={d.tagline} max={120} />
          </View>
          <View style={{ gap: 4 }}>
            <TextField
              label={t`About`}
              value={d.about}
              maxLength={3000}
              multiline
              placeholder={t`What happens here, and how to take part.`}
              helper={t`Markdown is supported.`}
              onChangeText={(v) => update({ about: v })}
              style={{ minHeight: 96, textAlignVertical: "top" }}
              testID="lobby-about"
            />
            <Counter value={d.about} max={3000} />
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t`Buttons`} description={t`Up to three buttons under the name, each opening a channel. Read the rules is added by itself when a rules channel is set.`} readOnly={ro}>
        <View style={{ gap: 12 }}>
          {d.actions.map((a, i) => {
            const setAction = (patch: Partial<LobbyDraft["actions"][number]>) => update({ actions: d.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <View key={i} testID={`lobby-button-${i}`} style={{ gap: 12, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <View style={{ width: 72 }}>
                    <TextField label={t`Emoji`} value={a.emoji ?? ""} maxLength={8} placeholder="👋" onChangeText={(v) => setAction({ emoji: v || undefined })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label={t`Label`} value={a.label} maxLength={32} placeholder={t`Say hi`} onChangeText={(v) => setAction({ label: v })} />
                  </View>
                  <IconBtn icon="trash" label={t`Remove button`} onPress={() => update({ actions: d.actions.filter((_, j) => j !== i) })} />
                </View>
                <View style={{ gap: 8 }}>
                  <AText size={13} line={20} weight="semibold" color={palette.fg2}>
                    {t`Opens`}
                  </AText>
                  <SelectField label={t`Opens`} value={channels.find((c) => c.id === a.channel) ? channelName(a.channel) : "—"} onPress={() => setSheet({ kind: "channel", target: i })} />
                </View>
              </View>
            );
          })}
          {d.actions.length < MAX_BUTTONS && channels.length ? (
            <AddButton label={t`Add a button`} testID="lobby-add-button" onPress={() => update({ actions: [...d.actions, { label: "", channel: channels[0].id }] })} />
          ) : null}
        </View>
      </SettingsSection>

      <SettingsSection title={t`Sections`} description={t`Choose what the lobby shows and in which order. Sections with nothing to show stay hidden by themselves.`} readOnly={ro}>
        <RowGroup>
          {d.sections.map((s, i) => {
            const info = sectionInfo[s.id];
            return (
              <View key={s.id} testID={`lobby-section-${s.id}`} style={{ paddingTop: 12, paddingBottom: 4, paddingHorizontal: 12, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 }}>
                  <Icon name={info.icon} size={20} color={palette.iconNeutral} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AText size={16} line={22} weight="medium" color={palette.fg}>
                      {info.title}
                    </AText>
                    <AText size={13} line={18} color={palette.muted}>
                      {info.line}
                    </AText>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <IconBtn icon="caret-up" label={t`Move up`} disabled={i === 0} onPress={() => update({ sections: move(d.sections, i, i - 1) })} />
                  <IconBtn icon="caret-down" label={t`Move down`} disabled={i === d.sections.length - 1} onPress={() => update({ sections: move(d.sections, i, i + 1) })} />
                  <View style={{ width: 8 }} />
                  <Toggle label={info.title} value={s.on} onChange={(on) => update({ sections: d.sections.map((x, j) => (j === i ? { ...x, on } : x)) })} testID={`lobby-section-${s.id}-on`} />
                </View>
              </View>
            );
          })}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Channels`} readOnly={ro}>
        <RowGroup>
          <ControlRow
            first
            icon="hand-waving"
            title={t`Hello channel`}
            description={t`Where new members say hello. Empty: the first button.`}
            control={<SelectPill label={t`Hello channel`} value={channelName(d.intro_channel)} onPress={() => setSheet({ kind: "channel", target: "intro" })} testID="lobby-intro-channel" />}
          />
          <ControlRow
            icon="megaphone"
            title={t`News channel`}
            description={t`Its newest message is the latest news. Empty: your first announcement channel.`}
            control={<SelectPill label={t`News channel`} value={channelName(d.news_channel)} onPress={() => setSheet({ kind: "channel", target: "news" })} testID="lobby-news-channel" />}
          />
          <View style={{ padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: palette.divider }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`Main channels`}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {t`Pick up to nine. None picked: the busiest channels are shown.`}
            </AText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {channels.map((c) => {
                const at = d.channels.indexOf(c.id);
                return (
                  <Chip key={c.id} label={`#${c.name}`} on={at >= 0} onPress={() => update({ channels: toggleIn(d.channels, c.id, MAX_MAIN_CHANNELS) })}>
                    {at >= 0 ? (
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" }}>
                        <AText size={11} line={14} weight="bold" color={palette.onAccent}>
                          {String(at + 1)}
                        </AText>
                      </View>
                    ) : null}
                    <AText size={14} line={20} color={palette.fg}>
                      {`#${c.name}`}
                    </AText>
                  </Chip>
                );
              })}
            </View>
          </View>
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Questions and answers`} description={t`Answer what new members ask most. Up to twenty.`} readOnly={ro}>
        <View style={{ gap: 12 }}>
          {d.faq.map((q, i) => {
            const n = i + 1;
            const setFaq = (patch: Partial<LobbyDraft["faq"][number]>) => update({ faq: d.faq.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <View key={i} testID={`lobby-faq-${i}`} style={{ gap: 12, padding: 16, paddingTop: 8, borderRadius: 14, backgroundColor: palette.field }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginEnd: -12 }}>
                  <AText size={13} line={18} weight="bold" color={palette.fg2} style={{ flex: 1 }}>
                    {t`Question ${n}`}
                  </AText>
                  <IconBtn icon="caret-up" label={t`Move up`} disabled={i === 0} onPress={() => update({ faq: move(d.faq, i, i - 1) })} />
                  <IconBtn icon="caret-down" label={t`Move down`} disabled={i === d.faq.length - 1} onPress={() => update({ faq: move(d.faq, i, i + 1) })} />
                  <IconBtn icon="trash" label={t`Remove question`} onPress={() => update({ faq: d.faq.filter((_, j) => j !== i) })} />
                </View>
                <TextField label={t`Question`} value={q.question} maxLength={150} placeholder={t`How do I get a role?`} onChangeText={(v) => setFaq({ question: v })} />
                <TextField label={t`Answer`} value={q.answer} maxLength={2000} multiline onChangeText={(v) => setFaq({ answer: v })} style={{ minHeight: 56, textAlignVertical: "top" }} />
              </View>
            );
          })}
          {d.faq.length < MAX_FAQ ? <AddButton label={t`Add a question`} testID="lobby-add-faq" onPress={() => update({ faq: [...d.faq, { question: "", answer: "" }] })} /> : null}
        </View>
      </SettingsSection>

      <SettingsSection title={t`Who runs it`} description={t`The owner is always listed. Pick the roles whose members are shown too, up to ten.`} readOnly={ro}>
        {roles.length === 0 ? (
          <AText size={13} line={20} color={palette.muted}>
            {t`This server has no roles yet. Make one in Roles first.`}
          </AText>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {roles.map((r) => (
            <Chip key={r.id} label={r.name} on={d.staff_roles.includes(r.id)} onPress={() => update({ staff_roles: toggleIn(d.staff_roles, r.id, MAX_STAFF_ROLES) })}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.colour && /^#[0-9a-f]{6}$/i.test(r.colour) ? r.colour : palette.pill }} />
              <AText size={14} line={20} color={palette.fg}>
                {r.name}
              </AText>
            </Chip>
          ))}
        </View>
      </SettingsSection>

      <PickerSheet
        visible={sheet?.kind === "channel"}
        title={target === "intro" ? t`Hello channel` : target === "news" ? t`News channel` : t`Opens`}
        value={pickedChannel}
        options={typeof target === "number" ? channelOptions.slice(1) : channelOptions}
        onPick={(v) => {
          if (target === "intro") update({ intro_channel: v });
          else if (target === "news") update({ news_channel: v });
          else if (typeof target === "number") update({ actions: d.actions.map((x, j) => (j === target ? { ...x, channel: v } : x)) });
        }}
        onClose={() => setSheet(null)}
      />
      <Sheet visible={!!colourSheet} onClose={() => setSheet(null)} testID="lobby-colour-sheet">
        {colourSheet ? (
          <View style={{ gap: 16 }}>
            <AText size={16} line={22} weight="semibold" color={palette.header}>
              {colourSheet.label}
            </AText>
            <View accessibilityRole="radiogroup" accessibilityLabel={colourSheet.label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {QUICK.map((c) => {
                const on = same(colourOf(colourSheet.key), c);
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityLabel={c}
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    onPress={() => setColour(colourSheet.key, c)}
                    style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: c, borderWidth: 2, borderColor: on ? palette.fg : palette.borderStrong }}
                  />
                );
              })}
            </View>
            <TextInput
              accessibilityLabel={t`${colourSheet.label} hex`}
              value={colourOf(colourSheet.key)}
              onChangeText={(v) => setColour(colourSheet.key, v)}
              maxLength={7}
              placeholder={t`Automatic`}
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.fieldBorder, color: palette.fg, fontSize: 16, lineHeight: 20, fontFamily: font, writingDirection: "ltr", textAlign: "left" }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <SmallButton label={t`Done`} primary testID="lobby-colour-done" onPress={() => setSheet(null)} />
            </View>
          </View>
        ) : null}
      </Sheet>
    </SettingsPage>
  );
}
