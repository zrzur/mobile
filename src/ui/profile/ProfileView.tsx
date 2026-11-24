import { useLingui } from "@lingui/react/macro";
import type { ServerMember, User } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { useFields } from "@/client/hooks";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { useBadgeText } from "@/ui/settings/user/profile-badge-text";
import { nameFontStyle } from "@/ui/settings/user/profile-look";

import { useFullProfile, useTargetMember, useTargetUser } from "./data";
import { nameRowBadges, profileBadgeIds, statusLine } from "./logic";
import { BadgeMark, BotLabel, EdgeButton, Gradient, InkProvider, ProfileAvatar, ProfileBackdrop, ProfileButton, useInk, useProfileInkFor } from "./parts";
import { ProfileBody } from "./ProfileSections";
import { openLayer } from "./store";
import { AttachmentViewer } from "@/ui/viewer/AttachmentViewer";
import { HEX, contrast } from "./theme";
import { copyToClipboard } from "@/ui/kit/share";

const RING = 92;
const AVATAR = 84;
const INSET = 16;
const RTL_FIRST = /^[^A-Za-z֐-ࣿ]*[֐-ࣿ]/;

type Facts = {
  name: string;
  username: string;
  discriminator: string;
  pronouns?: string;
  avatar?: string;
  presence?: string;
  status: string;
  relationship: string;
  self: boolean;
  bot: boolean;
  officialBot: boolean;
  verifiedBot: boolean;
  official: boolean;
  badges: number;
  theme?: string[];
  font?: string;
  colours?: string[];
  decoration?: string;
};

/**
 * Message (the one filled action, the kit Button), the answer to a request,
 * add friend, More. One line beside the avatar: with three buttons or more
 * the ones after the first show their icon alone (web ProfileActions, phone).
 */
function Actions({ user, f, onLeave, onMore, onEdit }: { user: User; f: Facts; onLeave: () => void; onMore: () => void; onEdit: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const ink = useInk();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<unknown>) => {
    setError(undefined);
    action().catch((err) => setError(describeError(err)));
  };
  const openDm = async () => {
    setBusy(true);
    try {
      const dm = await user.openDM();
      onLeave();
      router.push({ pathname: "/channel/[id]", params: { id: dm.id } });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const buttons: { key: string; label: string; icon?: string; onPress: () => void }[] = [];
  if (f.self) buttons.push({ key: "edit", label: t`Edit profile`, icon: "pencil-simple", onPress: onEdit });
  else {
    if (f.relationship === "Incoming") {
      buttons.push({ key: "accept", label: t`Accept request`, icon: "check", onPress: () => run(() => user.addFriend()) });
      buttons.push({ key: "ignore", label: t`Ignore`, onPress: () => run(() => user.removeFriend()) });
    }
    if (f.relationship === "Outgoing") buttons.push({ key: "cancel", label: t`Cancel request`, onPress: () => run(() => user.removeFriend()) });
  }
  const message = !f.self && f.relationship !== "Blocked";
  const addFriend = !f.self && !f.bot && f.relationship === "None";
  const count = buttons.length + (message ? 1 : 0) + (addFriend ? 1 : 0) + (f.self ? 0 : 1);
  return (
    <View style={{ gap: 4, maxWidth: "100%", marginStart: "auto" }}>
      <View style={{ flexDirection: "row", flexWrap: count >= 4 ? "wrap" : "nowrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
        {message ? (
          <View style={{ flexShrink: 1, minWidth: 44 }}>
            <Button testID="profile-message" label={t`Message`} icon="chat-circle" status={busy ? "submitting" : "ready"} onPress={() => void openDm()} />
          </View>
        ) : null}
        {buttons.map((b, i) => (
          <ProfileButton
            key={b.key}
            testID={`profile-${b.key}`}
            label={b.label}
            icon={b.icon as never}
            iconOnly={count >= 3 && (message || i > 0) && !!b.icon}
            onPress={b.onPress}
          />
        ))}
        {addFriend ? <EdgeButton testID="profile-add-friend" icon="user-plus" label={t`Add friend`} onPress={() => run(() => user.addFriend())} /> : null}
        {f.self ? null : <EdgeButton testID="profile-more" icon="dots-three" label={t`More`} onPress={onMore} />}
      </View>
      {error ? (
        <AText size={12} line={16} color={ink.themed ? ink.ink : palette.danger} accessibilityLiveRegion="polite">
          {error}
        </AText>
      ) : null}
    </View>
  );
}

/** Banner 3:1 with the avatar across its edge, the status beside it, actions at the end */
function Header({ user, member, f, bannerURL, width, onLeave, onMore, onEdit }: { user: User; member?: ServerMember; f: Facts; bannerURL?: string; width: number; onLeave: () => void; onMore: () => void; onEdit: () => void }) {
  const ink = useInk();
  const m = useFields(member, (x) => ({ avatar: x.avatarURL }));
  const { t } = useLingui();
  const height = Math.round(width / 3);
  const avatar = m?.avatar ?? f.avatar;
  // a tap on the picture or the banner shows it full screen (web: the image viewer)
  const [viewing, setViewing] = useState<"avatar" | "banner" | null>(null);
  const shown = viewing === "banner" ? bannerURL : viewing === "avatar" ? avatar : undefined;
  return (
    <View>
      {shown ? <AttachmentViewer items={[{ id: shown, url: shown, kind: "image", name: viewing === "banner" ? t`Profile banner` : t`Avatar` }]} index={0} onClose={() => setViewing(null)} /> : null}
      <Pressable
        testID="profile-banner"
        accessibilityRole={bannerURL ? "imagebutton" : undefined}
        accessibilityLabel={bannerURL ? t`Profile banner` : undefined}
        disabled={!bannerURL}
        onPress={() => setViewing("banner")}
        style={{ height, overflow: "hidden", backgroundColor: ink.bannerBg }}
      >
        {!bannerURL && ink.bannerTo ? <Gradient from={ink.bannerBg} to={ink.bannerTo} diagonal /> : null}
        {bannerURL ? <Image source={{ uri: bannerURL }} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      </Pressable>
      <View
        style={{
          position: "absolute",
          start: INSET,
          top: height - RING / 2,
          width: RING,
          height: RING,
          borderRadius: RING / 2,
          backgroundColor: ink.ring,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Pressable testID="profile-avatar" accessibilityRole={avatar ? "imagebutton" : undefined} accessibilityLabel={avatar ? t`Avatar` : undefined} disabled={!avatar} onPress={() => setViewing("avatar")}>
          <ProfileAvatar url={avatar} name={f.name} size={AVATAR} decoration={f.decoration} presence={f.official ? undefined : f.presence} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8, paddingTop: 8, paddingStart: INSET + RING + 8, paddingEnd: INSET, minHeight: RING / 2 + 8 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: f.status ? 120 : 0, minWidth: f.status ? 120 : 0 }}>
          {f.status ? (
            <View testID="profile-status-bubble" style={{ alignSelf: "flex-start", maxWidth: "100%", marginTop: -24, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: ink.line, backgroundColor: ink.bubble }}>
              {/* dir="auto": the status's own letters decide its direction */}
              <AText size={12} line={16} color={ink.ink} numberOfLines={1} style={{ writingDirection: RTL_FIRST.test(f.status) ? "rtl" : "ltr" }}>
                {f.status}
              </AText>
            </View>
          ) : null}
        </View>
        <Actions user={user} f={f} onLeave={onLeave} onMore={onMore} onEdit={onEdit} />
      </View>
    </View>
  );
}

/** Name (+ official mark, Bot), username#tag to copy • pronouns, every badge */
function Identity({ f, memberName, memberPronouns }: { f: Facts; memberName?: string; memberPronouns?: string }) {
  const { t } = useLingui();
  const ink = useInk();
  const { palette } = useTheme();
  const badgeText = useBadgeText();
  const [copied, setCopied] = useState(false);
  const [badge, setBadge] = useState<string | null>(null);
  const name = memberName ?? f.name;
  const pronouns = memberPronouns ?? f.pronouns;
  const badges = nameRowBadges(profileBadgeIds(f.badges, f.bot), "full");
  // a picked name colour only where it reads (web readableName)
  const picked = f.colours?.[0];
  const colour = !ink.themed && picked && HEX.test(picked) && HEX.test(ink.surface) && contrast(picked, ink.surface) >= 4.5 ? picked : ink.ink;
  const copy = async () => {
    await copyToClipboard(`${f.username}#${f.discriminator}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const shown = badge ? badgeText(badge) : null;
  return (
    <View style={{ gap: 4, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
        <AText autoDir testID="profile-name" size={22} line={28} weight="bold" color={colour} numberOfLines={1} accessibilityRole="header" style={[{ flexShrink: 1, letterSpacing: -0.2 }, nameFontStyle(f.font)]}>
          {name}
        </AText>
        {f.official ? (
          <View accessible accessibilityRole="image" accessibilityLabel={t`Official`}>
            <Icon name="shield-check" size={18} color={ink.themed ? ink.ink : palette.accentText} />
          </View>
        ) : null}
        {f.bot ? <BotLabel official={f.officialBot} verified={f.verifiedBot} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }}>
        <Pressable
          testID="profile-username"
          accessibilityRole="button"
          accessibilityLabel={t`Copy username`}
          accessibilityHint={copied ? t`Copied!` : undefined}
          onPress={() => void copy()}
          // a 44 px target on the 20 px line; with badges below it reaches
          // up into the name instead of down onto them
          style={{ minHeight: 44, marginTop: badges.length ? -20 : -12, marginBottom: badges.length ? -4 : -12, justifyContent: "center", flexShrink: 1 }}
        >
          <AText autoDir size={13} line={20} color={ink.ink} numberOfLines={1}>
            {f.username}
            <AText size={13} line={20} color={ink.muted}>
              {`#${f.discriminator}`}
            </AText>
          </AText>
        </Pressable>
        {copied ? (
          <AText size={12} line={16} color={ink.muted} accessibilityLiveRegion="polite">
            {t`Copied!`}
          </AText>
        ) : null}
        {pronouns ? (
          <>
            <AText size={12} line={20} color={ink.muted} accessibilityElementsHidden importantForAccessibility="no">
              •
            </AText>
            <AText autoDir size={13} line={20} color={ink.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>
              {pronouns}
            </AText>
          </>
        ) : null}
      </View>
      {badges.length ? (
        <View testID="profile-badge-row" accessibilityRole="list" accessibilityLabel={t`Profile badges`} style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -12 }}>
          {badges.map((id) => (
            <Pressable
              key={id}
              testID={`profile-badge-${id}`}
              accessibilityRole="button"
              accessibilityLabel={badgeText(id).name}
              accessibilityState={{ expanded: badge === id }}
              onPress={() => setBadge(badge === id ? null : id)}
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
            >
              <BadgeMark id={id} size={20} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {shown ? (
        <View testID="profile-badge-tip" style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: ink.line, backgroundColor: ink.chip, gap: 4 }} accessibilityLiveRegion="polite">
          <AText size={13} line={20} weight="semibold" color={ink.ink}>
            {shown.name}
          </AText>
          {shown.description ? (
            <AText size={12} line={16} color={ink.ink2}>
              {shown.description}
            </AText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "Message @name" box at the foot: sends straight into the DM and opens it (web ProfileMessage) */
function MessageBox({ user, name, onLeave }: { user: User; name: string; onLeave: () => void }) {
  const { t, i18n } = useLingui();
  const ink = useInk();
  const { palette } = useTheme();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [focused, setFocused] = useState(false);
  const send = async () => {
    const content = value.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const channel = await user.openDM();
      await channel.sendMessage(content);
      setValue("");
      onLeave();
      router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const placeholder = t`Message @${name}`;
  const ready = !!value.trim() && !busy;
  return (
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: 44,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: focused ? (ink.themed ? ink.ink : palette.focus) : ink.line,
          backgroundColor: ink.chip,
        }}
      >
        <TextInput
          testID="profile-message-input"
          value={value}
          editable={!busy}
          maxLength={2000}
          onChangeText={setValue}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          placeholderTextColor={ink.muted}
          selectionColor={ink.themed ? ink.ink : palette.accent}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            marginVertical: -1,
            paddingVertical: 0,
            paddingStart: 12,
            paddingEnd: 4,
            fontSize: 16,
            color: ink.ink,
            fontFamily: fontFamily(i18n.locale),
            ...inputDirStyle(value),
          }}
        />
        <Pressable
          testID="profile-message-send"
          accessibilityRole="button"
          accessibilityLabel={t`Send`}
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => void send()}
          style={{ width: 44, height: 44, marginVertical: -1, marginEnd: -1, alignItems: "center", justifyContent: "center", opacity: ready ? 1 : 0.4 }}
        >
          <Icon name="paper-plane-tilt" size={18} color={ready ? (ink.themed ? ink.ink : palette.accentText) : ink.muted} />
        </Pressable>
      </View>
      {error ? (
        <AText size={12} line={16} color={ink.themed ? ink.ink : palette.danger} accessibilityLiveRegion="polite">
          {error}
        </AText>
      ) : null}
    </View>
  );
}

/** The person's ID as one small line; a press copies it */
function ProfileId({ id }: { id: string }) {
  const { t } = useLingui();
  const ink = useInk();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      testID="profile-user-id"
      accessibilityRole="button"
      accessibilityLabel={t`Copy user ID`}
      onPress={async () => {
        await copyToClipboard(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{ alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, minHeight: 44 }}
    >
      <AText size={12} line={16} color={ink.muted}>
        {t`User ID`}
      </AText>
      <AText size={12} line={16} color={ink.muted} style={{ fontFamily: "monospace", writingDirection: "ltr" }}>
        {id}
      </AText>
      <Icon name="copy" size={12} color={ink.muted} />
      {copied ? (
        <AText size={12} line={16} color={ink.muted} accessibilityLiveRegion="polite">
          {t`Copied!`}
        </AText>
      ) : null}
    </Pressable>
  );
}

/**
 * The full profile (web UserProfileModal, which a phone opens on every tap
 * of a name): banner, avatar, actions, name, sections, roles in this
 * server, in common, note, then the message box and the ID. A themed
 * profile is drawn on its own gradient behind the scroller.
 */
export function ProfileView({
  userId,
  serverId,
  width,
  onLeave,
  wrap,
}: {
  userId: string;
  serverId?: string;
  width: number;
  /** close whatever shows the profile (a sheet, a page) */
  onLeave: () => void;
  /** the scroller around the content (sheet or page); its background stays clear */
  wrap: (children: React.ReactNode, surface: string) => React.ReactNode;
}) {
  const user = useTargetUser(userId);
  const member = useTargetMember(serverId, userId);
  const f = useFields(user, (u) => ({
    name: u.displayName,
    username: u.username,
    discriminator: u.discriminator,
    pronouns: u.pronouns,
    avatar: u.animatedAvatarURL,
    presence: u.presence as string,
    status: statusLine(u.statusEmoji, u.status?.text),
    relationship: u.relationship,
    // relationship is live; u.self compares with client.user, which is unset
    // when the profile opens before the gateway is ready (cold start, deep link)
    self: u.relationship === "User" || u.self,
    bot: !!u.bot,
    officialBot: u.officialBot,
    verifiedBot: u.verifiedBot,
    official: u.official,
    badges: u.badges,
    theme: u.style?.theme,
    font: u.style?.name_font,
    colours: u.style?.name_colour,
    decoration: u.style?.decoration,
  }));
  const mf = useFields(member, (m) => ({ name: m.displayName, pronouns: m.pronouns }));
  const profile = useFullProfile(userId, !!user);
  const ink = useProfileInkFor(f?.theme);
  const surface = (children: React.ReactNode) => (
    <InkProvider ink={ink}>
      {/* profile-themed: drawn in the owner's colours (the design audit reads them as user content) */}
      <View testID={ink.themed ? "profile-themed" : undefined} style={{ flex: 1, backgroundColor: ink.surface }}>
        <ProfileBackdrop />
        {wrap(children, "transparent")}
      </View>
    </InkProvider>
  );
  if (!user || !f) return surface(<LoadingHead width={width} />);
  const name = mf?.name ?? f.name;
  // your own profile: this server's identity, or the Profile settings page
  const edit = () => {
    if (member) openLayer(userId, serverId, "identity");
    else {
      onLeave();
      router.push({ pathname: "/user-settings/[section]", params: { section: "profile" } });
    }
  };
  return surface(
    <>
      <Header user={user} member={member} f={f} bannerURL={profile.data?.bannerURL} width={width} onLeave={onLeave} onMore={() => openLayer(userId, serverId, "menu")} onEdit={edit} />
      <View style={{ gap: 12, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Identity f={f} memberName={mf?.name} memberPronouns={mf?.pronouns} />
        <ProfileBody user={user} member={member} profile={profile.data} state={profile.state} self={f.self} onLeave={onLeave} onRetry={profile.reload} />
      </View>
      <View testID="profile-full-foot" style={{ gap: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: ink.line }}>
        {!f.self && f.relationship !== "Blocked" ? <MessageBox user={user} name={name} onLeave={onLeave} /> : null}
        <ProfileId id={user.id} />
      </View>
    </>,
  );
}

/** Placeholder while the person loads: the banner, the ring, two bars */
function LoadingHead({ width }: { width: number }) {
  const ink = useInk();
  const height = Math.round(width / 3);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height, backgroundColor: ink.bannerBg, overflow: "hidden" }}>{ink.bannerTo ? <Gradient from={ink.bannerBg} to={ink.bannerTo} diagonal /> : null}</View>
      <View style={{ position: "absolute", start: INSET, top: height - RING / 2, width: RING, height: RING, borderRadius: RING / 2, backgroundColor: ink.ring, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: ink.chip }} />
      </View>
      <View style={{ padding: 16, paddingTop: RING / 2 + 16, gap: 12 }}>
        <View style={{ width: "50%", height: 24, borderRadius: 6, backgroundColor: ink.chip }} />
        <View style={{ width: "32%", height: 16, borderRadius: 6, backgroundColor: ink.chip }} />
      </View>
    </View>
  );
}
