import { useLingui } from "@lingui/react/macro";
import type { Server, User } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields, useServer, useServerIds } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { HeaderButton, RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { InlineError, SaveBar, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { DECORATIONS, EFFECTS, NAMEPLATES, isCommunityRef, nameplateArt } from "./profile-catalog";
import { pickImage, ServerIdentitySheet } from "./profile-identity";
import { useLookLabels } from "./profile-labels";
import { BadgesTab } from "./profile-badges";
import {
  type LookStyle,
  type ProfileOriginal,
  type SectionRow,
  MAX_LINKS,
  buildUserEdit,
  cleanLinks,
  cleanStyle,
  colourKind,
  humanSize,
  initialSections,
  isDirty,
  linkHost,
  linkProblem,
  moveSection,
  sameStyle,
  sectionsBody,
} from "./profile-logic";
import { DecoratedAvatar, LookPickerSheet, NameStyleSheet, StyledName, ThemeEditor } from "./profile-look";
import { NavRow, Note, TabsBar, TextButton, Toast, useLoad, useToast } from "./profile-parts";

type Tab = "profile" | "badges";
type Picked = { uri: string; name: string; type: string };

/** Profile (web settings › Profile): tabs Profile | Badges */
export function ProfilePage({ tab }: { tab: Tab }) {
  const [current, setCurrent] = useState<Tab>(tab);
  return current === "badges" ? <BadgesPage onTab={setCurrent} /> : <ProfileTab onTab={setCurrent} />;
}

function Tabs({ value, onTab }: { value: Tab; onTab: (tab: Tab) => void }) {
  const { t } = useLingui();
  return (
    <TabsBar
      label={t`Profile`}
      value={value}
      onChange={onTab}
      tabs={[
        { id: "profile", title: t`Profile` },
        { id: "badges", title: t`Badges` },
      ]}
    />
  );
}

function BadgesPage({ onTab }: { onTab: (tab: Tab) => void }) {
  const { t } = useLingui();
  return (
    <SettingsPage title={t`Profile`} testID="settings-badges">
      <Tabs value="badges" onTab={onTab} />
      <BadgesTab />
    </SettingsPage>
  );
}

type OwnProfile = { content: string; bannerURL?: string; links: string[]; sections?: string[]; hiddenSections: string[]; creator: boolean };

/** The signed-in user, live */
function useSelf(): User | undefined {
  const client = useClient();
  return useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
}

function ProfileTab({ onTab }: { onTab: (tab: Tab) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const self = useSelf();
  const labels = useLookLabels();
  const me = useFields(self, (u) => ({
    username: u.username,
    displayName: u.displayName !== u.username ? u.displayName : "",
    pronouns: u.pronouns ?? "",
    avatar: u.avatar ? u.avatarURL : undefined,
    fallbackAvatar: u.avatarURL,
    discriminator: u.discriminator,
    bot: !!u.bot,
    style: JSON.stringify(cleanStyle(u.style as Record<string, unknown> | undefined)),
  }));
  const fetchProfile = useCallback(async (): Promise<OwnProfile | null> => {
    if (!self) return null;
    const p = await self.fetchProfile();
    return { content: p.content ?? "", bannerURL: p.animatedBannerURL ?? p.bannerURL, links: p.links ?? [], sections: p.sections, hiddenSections: p.hiddenSections ?? [], creator: !!p.creator };
  }, [self]);
  const loaded = useLoad(fetchProfile);
  const profile = loaded.data ?? null;
  const profileError = loaded.error;
  const loadProfile = loaded.reload;

  // the form: null = untouched (shows the saved value)
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [style, setStyle] = useState<LookStyle | null>(null);
  const [avatar, setAvatar] = useState<Picked | null | undefined>(undefined);
  const [banner, setBanner] = useState<Picked | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [sheet, setSheet] = useState<"decoration" | "name" | "nameplate" | "effect" | null>(null);
  const [identity, setIdentity] = useState<Server | null>(null);
  const [toast, showToast] = useToast();

  if (!me || !self) return null;

  const savedStyle: LookStyle = JSON.parse(me.style);
  const original: ProfileOriginal = { displayName: me.displayName, pronouns: me.pronouns, bio: profile?.content ?? "", style: savedStyle };
  const draft = {
    displayName: displayName ?? original.displayName,
    pronouns: pronouns ?? original.pronouns,
    bio: bio ?? original.bio,
    style: style ?? savedStyle,
  };
  const look = draft.style;
  const dirty = isDirty(original, { ...draft, avatar: avatar === undefined ? undefined : avatar === null ? null : "new", banner: banner === undefined ? undefined : banner === null ? null : "new" });

  const reset = () => {
    setDisplayName(null);
    setPronouns(null);
    setBio(null);
    setStyle(null);
    setAvatar(undefined);
    setBanner(undefined);
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const avatarId = avatar ? await client.uploadFile("avatars", avatar as unknown as File) : avatar;
      const bannerId = banner ? await client.uploadFile("backgrounds", banner as unknown as File) : banner;
      const body = buildUserEdit(original, { ...draft, avatar: avatarId, banner: bannerId });
      if (Object.keys(body).length) await self.edit(body as never);
      reset();
      await loadProfile();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const setLook = (change: Partial<LookStyle>) => {
    const next = { ...look, ...change };
    for (const key of Object.keys(change) as (keyof LookStyle)[]) if (change[key] === undefined) delete next[key];
    setStyle(sameStyle(next, savedStyle) ? null : next);
  };

  const limits = client.limits?.file_upload_size_limits;
  const avatarSize = humanSize(limits?.avatars ?? 0);
  const bannerSize = humanSize(limits?.backgrounds ?? 0);
  const avatarUrl = avatar === null ? undefined : avatar ? avatar.uri : me.avatar;
  const bannerUrl = banner === null ? undefined : banner ? banner.uri : profile?.bannerURL;
  const shownName = draft.displayName.trim() || me.username;
  const themed = !!look.theme?.length;
  const fontLabel = !look.name_font ? t`Default font` : labels.font(look.name_font);
  const kind = colourKind(look.name_colour);
  const colourLabel = kind === "gradient" ? t`Gradient` : kind === "solid" ? t`Solid colour` : t`No colour`;
  const handle = me.discriminator ? `${me.username}#${me.discriminator}` : me.username;

  const pickAvatar = async () => {
    const picked = await pickImage([1, 1]);
    if (picked) setAvatar(picked);
  };
  const pickBanner = async () => {
    const picked = await pickImage([17, 6]);
    if (picked) setBanner(picked);
  };

  const groups = [
    { id: "arab", title: t`Arab countries` },
    { id: "flag", title: t`Countries` },
    { id: "theme", title: t`Themes` },
    { id: "zodiac", title: t`Zodiac` },
  ];
  const withCurrent = (ids: readonly string[], current: string | undefined) => (current && !ids.includes(current) ? [...ids, current] : [...ids]);
  const sortByLabel = <T extends { label: string }>(list: T[]) => [...list].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <SettingsPage title={t`Profile`} testID="settings-profile" footer={<><SaveBar dirty={dirty} saving={saving} error={error} onReset={reset} onSave={() => void save()} /><Toast text={toast} testID="profile-toast" /></>}>
      <Tabs value="profile" onTab={onTab} />

      <SettingsSection title={t`Images`}>
        <RowGroup>
          {/* web: tap the picture to change it, the bin beside it removes it */}
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable testID="profile-avatar-change" accessibilityRole="button" accessibilityLabel={t`Change avatar`} onPress={() => void pickAvatar()} style={({ pressed }) => ({ borderRadius: 36, opacity: pressed ? 0.8 : 1 })}>
                <Avatar url={avatarUrl ?? me.fallbackAvatar} name={shownName} size={72} />
              </Pressable>
              {avatarUrl ? <HeaderButton icon="trash" label={t`Remove avatar`} onPress={() => setAvatar(null)} testID="profile-avatar-remove" /> : null}
            </View>
            <View style={{ gap: 4 }}>
              <AText size={14} line={20} weight="semibold" color={palette.fg}>
                {t`Avatar`}
              </AText>
              <Note>{t`Recommended: 512 × 512 px (1:1). Up to ${avatarSize}. Cropped to a circle; keep faces and logos in the center.`}</Note>
            </View>
          </View>
          <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: palette.divider }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                testID="profile-banner-change"
                accessibilityRole="button"
                accessibilityLabel={t`Change banner`}
                onPress={() => void pickBanner()}
                style={({ pressed }) => ({ height: 56, aspectRatio: 680 / 240, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: palette.borderSoft, backgroundColor: palette.tonal, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
              >
                {bannerUrl ? <Image source={{ uri: bannerUrl }} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : <Icon name="image" size={20} color={palette.muted} />}
              </Pressable>
              {bannerUrl ? <HeaderButton icon="trash" label={t`Remove banner`} onPress={() => setBanner(null)} testID="profile-banner-remove" /> : null}
            </View>
            <View style={{ gap: 4 }}>
              <AText size={14} line={20} weight="semibold" color={palette.fg}>
                {t`Banner`}
              </AText>
              <Note>{t`Recommended: 680 × 240 px (17:6). Up to ${bannerSize}. Edges may be cropped on different screens; keep important details in the center.`}</Note>
            </View>
          </View>
        </RowGroup>
      </SettingsSection>

      {!me.bot ? (
        <SettingsSection title={t`Look`}>
          <RowGroup>
            <NavRow
              first
              leading={<DecoratedAvatar url={avatarUrl ?? me.fallbackAvatar} name={shownName} size={26} decoration={look.decoration} />}
              title={t`Avatar decoration`}
              description={look.decoration ? labels.decoration(look.decoration) : t`None`}
              onPress={() => setSheet("decoration")}
              testID="profile-decoration"
            />
            <NavRow icon="text-aa" title={t`Name style`} description={`${fontLabel} · ${colourLabel}`} onPress={() => setSheet("name")} testID="profile-name-style" />
            <NavRow icon="identification-card" title={t`Nameplate`} description={look.nameplate ? labels.nameplate(look.nameplate) : t`None`} onPress={() => setSheet("nameplate")} testID="profile-nameplate" />
            <NavRow icon="sparkle" title={t`Profile effect`} description={look.effect ? labels.effect(look.effect) : t`No effect`} onPress={() => setSheet("effect")} testID="profile-effect" />
          </RowGroup>
        </SettingsSection>
      ) : null}

      {!me.bot ? (
        <SettingsSection title={t`Profile theme`} description={t`Colours your profile card and its banner when you have no picture.`}>
          <ThemeEditor value={look.theme} onChange={(theme) => setLook({ theme })} />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t`About`}>
        <View style={{ gap: 16 }}>
          <TextField
            label={t`Display name`}
            value={draft.displayName}
            onChangeText={setDisplayName}
            placeholder={me.username}
            maxLength={32}
            helper={`${draft.displayName.length}/32 · ${t`Shown instead of your username. Leave empty to use your username.`}`}
            testID="profile-display-name"
          />
          <TextField label={t`Pronouns`} value={draft.pronouns} onChangeText={setPronouns} placeholder={t`e.g. she/her, they/them`} maxLength={24} helper={`${draft.pronouns.length}/24`} testID="profile-pronouns" />
          <TextField
            label={t`Bio`}
            value={draft.bio}
            onChangeText={setBio}
            placeholder={t`Something cool about me...`}
            helper={t`Markdown and emoji are supported.`}
            multiline
            maxLength={2000}
            style={{ minHeight: 96, textAlignVertical: "top" }}
            testID="profile-bio"
          />
        </View>
      </SettingsSection>

      {!me.bot ? (
        <RowGroup>
          <NavRow
            first
            icon="at"
            title={t`Username`}
            description={(() => {
              const handleText = handle;
              return t`${handleText}. Change it in My Account.`;
            })()}
            onPress={() => router.push({ pathname: "/user-settings/[section]", params: { section: "account" } })}
            testID="profile-username"
          />
        </RowGroup>
      ) : null}

      {/* preview card (web: column beside the form; on a phone it follows About) */}
      <View accessibilityLabel={t`Profile preview`} style={{ gap: 8 }}>
        <AText size={13} line={20} weight="semibold" color={palette.fg2} accessibilityRole="header" style={{ paddingHorizontal: 2 }}>
          {t`Preview`}
        </AText>
        <View testID={themed ? "profile-themed" : undefined} style={{ borderRadius: 14, overflow: "hidden", backgroundColor: themed ? look.theme![look.theme!.length - 1] : palette.field }}>
          <View style={{ height: 96, backgroundColor: themed ? look.theme![0] : palette.tonal }}>
            {bannerUrl ? <Image source={{ uri: bannerUrl }} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : null}
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            <View style={{ marginTop: -36 }}>
              <DecoratedAvatar url={avatarUrl ?? me.fallbackAvatar} name={shownName} size={72} decoration={look.decoration} />
            </View>
            <StyledName text={shownName} font={look.name_font} colours={look.name_colour} forceWhite={themed} />
            <AText autoDir size={13} line={18} color={themed ? palette.onOverlay : palette.muted} numberOfLines={1}>
              {draft.pronouns.trim() ? `${handle} · ${draft.pronouns.trim()}` : handle}
            </AText>
            <View style={{ height: 1, backgroundColor: themed ? palette.onOverlayDivider : palette.divider, marginVertical: 4 }} />
            <AText size={12} line={16} weight="semibold" color={themed ? palette.onOverlay : palette.fg2}>
              {t`About me`}
            </AText>
            <AText size={14} line={20} color={themed ? palette.onOverlay : palette.fg}>
              {draft.bio.trim() || t`Nothing here yet.`}
            </AText>
          </View>
        </View>
      </View>


      {profileError ? <InlineError message={describeError(profileError)} /> : null}
      {profile ? <SectionsBlock key={`s-${(profile.sections ?? []).join(",")}-${profile.hiddenSections.join(",")}`} self={self} profile={profile} onSaved={(text) => { showToast(text); void loadProfile(); }} /> : null}
      {profile ? <LinksBlock key={`l-${profile.links.join(",")}`} self={self} links={profile.links} onSaved={(text) => { showToast(text); void loadProfile(); }} /> : null}

      <ServerProfiles onOpen={setIdentity} />

      {sheet === "decoration" ? (
        <LookPickerSheet
          testID="decoration-dialog"
          title={t`Change avatar decoration`}
          description={t`A frame around your avatar. All of them are free.`}
          searchLabel={t`Search decorations`}
          noneLabel={t`None`}
          emptyText={t`No decorations match your search.`}
          items={withCurrent(DECORATIONS, look.decoration).map((id) => ({ id, label: labels.decoration(id) }))}
          value={look.decoration}
          tile={(id) => <DecoratedAvatar url={avatarUrl ?? me.fallbackAvatar} name={shownName} size={36} decoration={id} />}
          onApply={(id) => {
            setLook({ decoration: id });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "nameplate" ? (
        <LookPickerSheet
          testID="nameplate-dialog"
          title={t`Change nameplate`}
          description={t`A background behind your name in member lists. All of them are free.`}
          searchLabel={t`Search nameplates`}
          noneLabel={t`None`}
          emptyText={t`No nameplates match your search.`}
          note={t`Your nameplate shows behind your name in member lists.`}
          groups={groups}
          items={sortByLabel([
            ...NAMEPLATES.map((p) => ({ id: p.id, label: labels.nameplate(p.id), group: p.group as string })),
            ...(look.nameplate && !NAMEPLATES.some((p) => p.id === look.nameplate) ? [{ id: look.nameplate, label: labels.nameplate(look.nameplate), group: "theme" }] : []),
          ])}
          value={look.nameplate}
          tile={(id) =>
            id && !isCommunityRef(id) ? (
              <Image source={{ uri: nameplateArt(id) }} style={{ width: "100%", aspectRatio: 448 / 84, borderRadius: 6 }} contentFit="contain" />
            ) : (
              <Icon name={id ? "identification-card" : "prohibit"} size={22} color={palette.muted} />
            )
          }
          onApply={(id) => {
            setLook({ nameplate: id });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "effect" ? (
        <LookPickerSheet
          testID="effect-dialog"
          title={t`Profile effect`}
          searchLabel={t`Search effects`}
          noneLabel={t`No effect`}
          emptyText={t`No effects match your search.`}
          note={t`Plays once when someone opens your profile, for up to 4 seconds.`}
          items={withCurrent(EFFECTS, look.effect).map((id) => ({ id, label: labels.effect(id) }))}
          value={look.effect}
          tile={(id) => <Icon name={id ? "sparkle" : "prohibit"} size={26} color={id ? palette.accentText : palette.muted} />}
          onApply={(id) => {
            // a community effect keeps its file; a built-in one has none
            setLook({ effect: id, effect_file: id && isCommunityRef(id) ? look.effect_file : undefined });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "name" ? (
        <NameStyleSheet
          name={shownName}
          font={look.name_font}
          colours={look.name_colour}
          onApply={(font, colours) => {
            setLook({ name_font: font, name_colour: colours });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {identity ? <ServerIdentitySheet server={identity} onClose={() => setIdentity(null)} /> : null}
    </SettingsPage>
  );
}

/** Profile sections: what shows and in which order (own save) */
function SectionsBlock({ self, profile, onSaved }: { self: User; profile: OwnProfile; onSaved: (toast: string) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const start = initialSections(profile.sections, profile.hiddenSections, profile.creator);
  const [rows, setRows] = useState<SectionRow[]>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [announce, setAnnounce] = useState("");
  const dirty = JSON.stringify(rows) !== JSON.stringify(start);

  const names: Record<string, string> = {
    about: t`About me`,
    links: t`Links`,
    creations: t`Their creations`,
    wearing: t`Wearing`,
    member_since: t`Member since`,
    connections: t`Connections`,
    games: t`Games`,
  };

  const move = (index: number, by: -1 | 1) => {
    const next = moveSection(rows, index, by);
    setRows(next);
    const label = names[rows[index].id];
    const n = index + by + 1;
    setAnnounce(t`${label}: position ${n}`);
  };

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await self.edit({ profile: sectionsBody(rows, profile.hiddenSections) } as never);
      onSaved(t`Saved`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title={t`Profile sections`} description={t`Choose what shows on your profile and in what order. Hidden sections are not sent to anyone.`}>
      <View style={{ gap: 8 }}>
        <RowGroup>
          {rows.map((row, i) => {
            const label = names[row.id];
            return (
              // web: the switch first, the name, then the move arrows
              <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingStart: 8, paddingEnd: 4, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                <Toggle label={label} value={row.shown} onChange={(shown) => setRows(rows.map((r) => (r.id === row.id ? { ...r, shown } : r)))} testID={`section-${row.id}`} />
                <AText size={14} line={20} weight="medium" color={row.shown ? palette.fg : palette.muted} style={{ flex: 1 }} numberOfLines={1}>
                  {label}
                </AText>
                <MoveButton icon="caret-up" label={t`Move ${label} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                <MoveButton icon="caret-down" label={t`Move ${label} down`} disabled={i === rows.length - 1} onPress={() => move(i, 1)} />
              </View>
            );
          })}
        </RowGroup>
        <AText size={1} line={1} color="transparent" accessibilityLiveRegion="polite" style={{ height: 1, opacity: 0 }}>
          {announce}
        </AText>
        <Note>{t`Roles, mutual servers and the message box keep their place.`}</Note>
        <InlineError message={error} />
        {dirty ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
            <TextButton label={t`Reset`} onPress={() => setRows(start)} />
            <Button label={t`Save changes`} size="sm" status={busy ? "submitting" : "ready"} onPress={() => void save()} testID="sections-save" />
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}

function MoveButton({ icon, label, disabled, onPress }: { icon: "caret-up" | "caret-down"; label: string; disabled: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? palette.navHover : "transparent" })}
    >
      <Icon name={icon} size={18} color={palette.fg2} />
    </Pressable>
  );
}

/** Links on the profile, up to five https:// addresses (own save) */
function LinksBlock({ self, links, onSaved }: { self: User; links: string[]; onSaved: (toast: string) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [list, setList] = useState<string[]>(links);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dirty = JSON.stringify(cleanLinks(list)) !== JSON.stringify(cleanLinks(links)) || list.length !== links.length;
  const problems = list.map(linkProblem);

  const save = async () => {
    setTried(true);
    if (problems.some(Boolean)) return;
    setBusy(true);
    setError(undefined);
    try {
      await self.edit({ profile: { links: cleanLinks(list) } } as never);
      onSaved(t`Saved`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t`Links`}
      description={t`Up to ${MAX_LINKS} links, starting with https://. People see the real site address and a warning before they leave Zrzur. Others can see this.`}
    >
      <View style={{ gap: 12 }}>
        {list.length === 0 ? <Note>{t`No links yet.`}</Note> : null}
        {list.map((value, i) => {
          const n = i + 1;
          const problem = tried ? problems[i] : undefined;
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t`Link ${n}`}
                  value={value}
                  onChangeText={(v) => setList(list.map((l, j) => (j === i ? v : l)))}
                  placeholder="https://"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={256}
                  style={{ writingDirection: "ltr", textAlign: "left" }}
                  helper={problem ? undefined : linkHost(value)}
                  error={problem === "https" ? t`Links must start with https://` : problem === "host" ? t`Use a real site address, such as https://example.com` : undefined}
                  testID={`profile-link-${n}`}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t`Remove link ${n}`}
                onPress={() => setList(list.filter((_, j) => j !== i))}
                style={({ pressed }) => ({ marginTop: 28, width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
              >
                <Icon name="trash" size={18} color={palette.iconMuted} />
              </Pressable>
            </View>
          );
        })}
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {list.length < MAX_LINKS ? <SmallButton label={t`Add link`} onPress={() => setList([...list, ""])} testID="profile-link-add" /> : <View />}
          {dirty ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextButton
                label={t`Reset`}
                onPress={() => {
                  setList(links);
                  setTried(false);
                }}
              />
              <Button label={t`Save changes`} size="sm" status={busy ? "submitting" : "ready"} onPress={() => void save()} testID="links-save" />
            </View>
          ) : null}
        </View>
        <InlineError message={error} />
      </View>
    </SettingsSection>
  );
}

/** Server profiles: one row per joined server, opens the identity dialog */
function ServerProfiles({ onOpen }: { onOpen: (server: Server) => void }) {
  const { t } = useLingui();
  const ids = useServerIds();
  return (
    <SettingsSection title={t`Server profiles`} description={t`Use a different nickname or avatar in a specific server.`}>
      <RowGroup>
        {ids.length ? (
          ids.map((id, i) => <ServerRow key={id} id={id} first={i === 0} onOpen={onOpen} />)
        ) : (
          <View style={{ padding: 16, gap: 2 }}>
            <EmptyRowTitle title={t`You're not in any servers yet`} text={t`Server profiles appear here once you join one.`} />
          </View>
        )}
      </RowGroup>
    </SettingsSection>
  );
}

function EmptyRowTitle({ title, text }: { title: string; text: string }) {
  const { palette } = useTheme();
  return (
    <>
      <AText size={14} line={20} weight="semibold" color={palette.fg}>
        {title}
      </AText>
      <AText size={13} line={18} color={palette.muted}>
        {text}
      </AText>
    </>
  );
}

function ServerRow({ id, first, onOpen }: { id: string; first: boolean; onOpen: (server: Server) => void }) {
  const server = useServer(id);
  const s = useFields(server, (v) => ({ name: v.name, icon: v.iconURL }));
  if (!server || !s) return null;
  return <NavRow first={first} leading={<Avatar url={s.icon} name={s.name} size={24} square />} title={s.name} onPress={() => onOpen(server)} testID={`server-profile-${id}`} />;
}

