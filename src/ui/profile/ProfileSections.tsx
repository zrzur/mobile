import { useLingui } from "@lingui/react/macro";
import type { ServerMember, User } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { Pressable, Text, TextInput, View } from "react-native";

import { longDate } from "@/chat/time";
import { type Inline, parseMessage } from "@/chat/markdown";
import { directionText } from "@/chat/paragraphs";
import { openLink } from "@/chat/overlays";
import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { secureStorage } from "@/lib/secureStorage";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Logo } from "@/ui/Logo";

import type { FullProfile, ProfileConnection, ProfileGames } from "./data";
import { type Mutual, interestsAt, linkDomain, linkName, mutualFor, safeProfileLinks, serviceUrl, visibleSections } from "./logic";
import { Chip, ChipText, ProfileButton, Section, useInk } from "./parts";
import { BotSections } from "./BotSections";
import { openProfile } from "./store";
import { openExternal } from "@/ui/kit/openLink";
import { inputDirStyle, isolate, paragraphDirStyle } from "@/ui/kit/bidi";

const HEX = /^#[0-9a-f]{6}$/i;

/** Placeholder bars while the profile loads (web ProfileSkeleton) */
export function ProfileSkeleton() {
  const ink = useInk();
  const bar = (width: number | `${number}%`, height = 16) => <View style={{ width, height, borderRadius: 6, backgroundColor: ink.chip }} />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 12 }}>
      {bar("40%")}
      {bar("100%")}
      {bar("72%")}
      {bar("100%", 120)}
      {bar("100%")}
    </View>
  );
}

/** Member since: on Zrzur, and on this server when opened from one */
function Joined({ user, member, first }: { user: User; member?: ServerMember; first: boolean }) {
  const { t, i18n } = useLingui();
  const ink = useInk();
  const f = useFields(user, (u) => ({ since: u.createdAt.getTime() }));
  const m = useFields(member, (x) => ({ joined: x.joinedAt.getTime(), server: x.server?.name ?? "", icon: x.server?.iconURL }));
  if (!f) return null;
  const since = longDate(new Date(f.since), i18n.locale);
  const joined = m ? longDate(new Date(m.joined), i18n.locale) : "";
  const server = m?.server ?? "";
  return (
    <Section first={first} label={t`Member since`}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <View style={{ marginTop: 2 }}>
            <Logo size={16} color={ink.ink2} />
          </View>
          <AText size={13} line={20} color={ink.ink2} style={{ flex: 1 }}>
            {t`Zrzur since ${since}`}
          </AText>
        </View>
        {m && server ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <View style={{ marginTop: 2 }}>
              <Avatar url={m.icon} name={server} size={16} square />
            </View>
            <AText size={13} line={20} color={ink.ink2} style={{ flex: 1 }}>
              {t`in ${server} since ${joined}`}
            </AText>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

const BIO_LINES = 4;

/**
 * The bio's words in the profile's ink (web ProfileBio: 13/20, secondary,
 * links underlined). One text block, so a clamp ends on a whole line with "…".
 */
function BioText({ content, lines, onLayout }: { content: string; lines?: number; onLayout?: (height: number) => void }) {
  const { i18n } = useLingui();
  const ink = useInk();
  const { palette } = useTheme();
  const client = useClient();
  const cdn = client.configuration?.features?.autumn?.url?.replace(/\/$/, "");
  const blocks = parseMessage(content);
  const inline = (pieces: Inline[], key: string): React.ReactNode[] =>
    pieces.map((p, i) => {
      const k = `${key}-${i}`;
      switch (p.t) {
        case "text":
          return p.v;
        case "bold":
          return (
            <Text key={k} style={{ fontFamily: fontFamily(i18n.locale, "bold") }}>
              {inline(p.c, k)}
            </Text>
          );
        case "italic":
          return (
            <Text key={k} style={{ fontStyle: "italic" }}>
              {inline(p.c, k)}
            </Text>
          );
        case "underline":
        case "strike":
          return (
            <Text key={k} style={{ textDecorationLine: p.t === "underline" ? "underline" : "line-through" }}>
              {inline(p.c, k)}
            </Text>
          );
        case "spoiler":
          return (
            <Text key={k} style={{ color: ink.muted }}>
              {inline(p.c, k)}
            </Text>
          );
        case "code":
          return (
            <Text key={k} style={{ fontFamily: "monospace", backgroundColor: ink.chip, color: ink.ink }}>
              {` ${p.v} `}
            </Text>
          );
        case "user": {
          const user = client.users.get(p.id);
          return (
            <Text key={k} accessibilityRole="button" onPress={() => openProfile(p.id)} style={{ color: ink.themed ? ink.ink : palette.accentText, fontFamily: fontFamily(i18n.locale, "semibold") }}>
              {isolate(`@${user?.displayName ?? user?.username ?? "…"}`)}
            </Text>
          );
        }
        case "role":
          return `@…`;
        case "channel": {
          const channel = client.channels.get(p.id);
          return `#${channel?.name ?? "…"}`;
        }
        case "emoji":
          return cdn ? <Image key={k} source={{ uri: `${cdn}/emojis/${p.id}` }} style={{ width: 18, height: 18 }} cachePolicy="memory-disk" contentFit="contain" /> : `:${p.id}:`;
        case "link":
          return (
            <Text key={k} accessibilityRole="link" onPress={() => openLink(p.url, p.label ?? p.url)} style={{ color: ink.link, textDecorationLine: "underline" }}>
              {isolate(p.label ?? p.url)}
            </Text>
          );
      }
    });
  const body: React.ReactNode[] = [];
  blocks.forEach((b, i) => {
    if (i) body.push("\n");
    body.push(b.t === "codeblock" ? <Text key={`c${i}`} style={{ fontFamily: "monospace" }}>{b.v}</Text> : inline(b.c, `b${i}`));
  });
  // dir="auto": the bio's own first letter decides its direction and its side (one block, so a clamp ends on a whole line)
  const own = paragraphDirStyle(blocks.map((b) => (b.t === "codeblock" ? "" : directionText(b.c))).join(" "));
  return (
    <AText
      size={13}
      line={20}
      color={ink.ink2}
      numberOfLines={lines}
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.height) : undefined}
      style={own}
    >
      {body}
    </AText>
  );
}

/** About me: four whole lines ending in "…", then Show more / Show less */
function Bio({ content, first }: { content?: string; first: boolean }) {
  const { t, i18n } = useLingui();
  const ink = useInk();
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  if (!content) return null;
  const line = 20 + (i18n.locale === "ar" ? 2 : 0);
  return (
    <Section first={first} title={t`About me`}>
      <View testID="profile-bio">
        <BioText content={content} lines={open ? undefined : BIO_LINES} />
        {/* the whole text, unseen, tells whether it runs past four lines */}
        {!long ? (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 0, start: 0, end: 0, opacity: 0 }}>
            <BioText content={content} onLayout={(h) => h > line * BIO_LINES + 1 && setLong(true)} />
          </View>
        ) : null}
      </View>
      {long ? (
        <Pressable
          testID="profile-bio-more"
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginVertical: -12 }}
        >
          <AText size={13} line={20} weight="semibold" color={ink.ink}>
            {open ? t`Show less` : t`Show more`}
          </AText>
        </Pressable>
      ) : null}
    </Section>
  );
}

/** Links as compact chips: a known site's name, or the site itself */
function Links({ links, first }: { links: string[]; first: boolean }) {
  const { t } = useLingui();
  const ink = useInk();
  const safe = safeProfileLinks(links);
  if (!safe.length) return null;
  return (
    <Section first={first} title={t`Links`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {safe.map((l, i) => (
          <Chip key={`${l.href}-${i}`} testID="profile-link" label={l.href} onPress={() => openLink(l.href)} leading={<Icon name="link" size={14} color={ink.ink} />}>
            <ChipText strong>{linkName(l.host)}</ChipText>
            {safe.length === 1 && linkName(l.host) !== linkDomain(l.host) ? (
              <AText size={12} line={16} color={ink.ink2} numberOfLines={1}>
                {linkDomain(l.host)}
              </AText>
            ) : null}
          </Chip>
        ))}
      </View>
    </Section>
  );
}

const SERVICE_NAMES: Record<string, string> = { twitch: "Twitch", github: "GitHub", battlenet: "Battle.net", steam: "Steam" };

/** One Interests panel: name, facts ending in the source, View, then rows */
function InterestPanel({ connection, games }: { connection?: ProfileConnection; games?: ProfileGames }) {
  const { t, i18n } = useLingui();
  const ink = useInk();
  const { palette } = useTheme();
  const [all, setAll] = useState(false);
  const number = (n: number) => new Intl.NumberFormat(i18n.locale).format(n);
  const service = games ? "steam" : connection!.service;
  const name = games ? games.display_name : connection!.display_name;
  const url = serviceUrl(service, games ? games.profile_url : connection!.profile_url);
  const facts = games
    ? [t`${number(games.game_count ?? 0)} games`, t`${number(games.total_hours ?? 0)} h`, t`From Steam`]
    : service === "github"
      ? [connection!.followers !== undefined ? t`${number(connection!.followers)} followers` : "", connection!.public_repos !== undefined ? t`${number(connection!.public_repos)} repositories` : "", t`From GitHub`]
      : service === "twitch"
        ? [connection!.kind === "partner" ? t`Partner` : connection!.kind === "affiliate" ? t`Affiliate` : "", t`From Twitch`]
        : [t`From Battle.net`];
  const rows: { key: string; name: string; end?: string }[] = games
    ? games.games.map((g) => ({ key: String(g.appid), name: g.name, end: t`${number(g.hours)} h` }))
    : (connection!.repos ?? []).map((r) => ({ key: String(r.id), name: r.name, end: t`${number(r.stars)} stars` }));
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <View style={{ gap: 12, padding: 12, borderRadius: 10, backgroundColor: ink.chip }}>
      {games?.private ? (
        <AText size={13} line={20} color={ink.ink2}>
          {t`This Steam account is private.`}
        </AText>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AText autoDir size={14} line={20} weight="semibold" color={ink.ink} numberOfLines={1}>
                {name}
              </AText>
              <AText size={12} line={16} color={ink.ink2} numberOfLines={2}>
                {facts.filter(Boolean).join(" · ")}
              </AText>
            </View>
            {connection?.live ? (
              <AText size={12} line={16} weight="semibold" color={ink.themed ? ink.ink : palette.danger}>
                {t`Live now`}
              </AText>
            ) : null}
            {url ? (
              <Chip testID="profile-interest-view" label={t`View on ${SERVICE_NAMES[service]}`} onPress={() => void openExternal(url)}>
                <ChipText>{t`View`}</ChipText>
              </Chip>
            ) : null}
          </View>
          {shown.length ? (
            <View style={{ gap: 4 }}>
              {shown.map((r) => (
                <View key={r.key} style={{ flexDirection: "row", gap: 8 }}>
                  <AText autoDir size={13} line={20} color={ink.ink} numberOfLines={1} style={{ flex: 1 }}>
                    {r.name}
                  </AText>
                  {r.end ? (
                    <AText size={12} line={20} color={ink.ink2}>
                      {r.end}
                    </AText>
                  ) : null}
                </View>
              ))}
            </View>
          ) : games ? (
            <AText size={13} line={20} color={ink.ink2}>
              {t`No games to show.`}
            </AText>
          ) : null}
          {rows.length > 3 ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll((v) => !v)} style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginVertical: -12 }}>
              <AText size={13} line={20} weight="semibold" color={ink.ink}>
                {all ? t`Show less` : t`Show all ${rows.length}`}
              </AText>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Games and linked accounts as tabs, one per service (web ProfileInterests) */
function Interests({ profile, first }: { profile: FullProfile; first: boolean }) {
  const { t } = useLingui();
  const ink = useInk();
  const items = [...(profile.games ? [{ id: "games", label: t`Games` }] : []), ...profile.connections.map((c) => ({ id: c.service as string, label: SERVICE_NAMES[c.service] ?? c.service }))];
  const [picked, setPicked] = useState<string | null>(null);
  if (!items.length) return null;
  const current = items.find((i) => i.id === picked)?.id ?? items[0].id;
  const connection = profile.connections.find((c) => c.service === current);
  return (
    <Section first={first} title={t`Interests`}>
      {items.length > 1 ? (
        <View accessibilityRole="tablist" accessibilityLabel={t`Interests`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {items.map((i) => (
            <Pressable
              key={i.id}
              testID={`profile-interest-${i.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: current === i.id }}
              onPress={() => setPicked(i.id)}
              style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 6, justifyContent: "center", borderWidth: 1, borderColor: current === i.id ? ink.ink2 : ink.line, backgroundColor: current === i.id ? ink.chipPressed : "transparent" }}
            >
              <AText size={12} line={16} weight="semibold" color={ink.ink}>
                {i.label}
              </AText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <InterestPanel key={current} games={current === "games" ? profile.games : undefined} connection={current === "games" ? undefined : connection} />
    </Section>
  );
}

/** Server roles as chips with their colour */
function Roles({ member, first }: { member?: ServerMember; first: boolean }) {
  const { t } = useLingui();
  const ink = useInk();
  const f = useFields(member, (m) => ({
    server: m.server?.name ?? "",
    roles: m.orderedRoles.filter((r) => (m.server ? m.server.roles.has(r.id) : true)).map((r) => ({ id: r.id, name: r.name, colour: r.colour })),
  }));
  if (!f || !f.roles.length) return null;
  const server = f.server;
  return (
    <Section first={first} title={server ? t`Roles in ${server}` : t`Roles`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[...f.roles].reverse().map((r) => (
          <Chip key={r.id} leading={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.colour && HEX.test(r.colour) ? r.colour : ink.ink2 }} />}>
            <ChipText>{r.name}</ChipText>
          </Chip>
        ))}
      </View>
    </Section>
  );
}

/** Servers and friends in common: a summary line, then the chips */
function Mutuals({ user, onLeave, first }: { user: User; onLeave: () => void; first: boolean }) {
  const { t } = useLingui();
  const ink = useInk();
  const client = useClient();
  const selfId = useSelfId();
  const [mutual, setMutual] = useState<{ for: string; list: Mutual | null } | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    let alive = true;
    void mutualFor(() => user.fetchMutual(), selfId ?? "", user.id, Date.now()).then((list) => alive && setMutual({ for: user.id, list }));
    return () => {
      alive = false;
    };
  }, [user, selfId]);
  const ids = mutual?.for === user.id ? mutual.list : null;
  const servers = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          (ids?.servers ?? [])
            .map((id) => client.servers.get(id))
            .filter((s) => !!s)
            .map((s) => ({ id: s!.id, name: s!.name, icon: s!.iconURL })),
        ),
      [client, ids],
    ),
  );
  const friends = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          (ids?.users ?? [])
            .map((id) => client.users.get(id))
            .filter((u) => !!u)
            .map((u) => ({ id: u!.id, name: u!.displayName, avatar: u!.avatarURL })),
        ),
      [client, ids],
    ),
  );
  if (!ids) return null;
  const s = JSON.parse(servers) as { id: string; name: string; icon?: string }[];
  const f = JSON.parse(friends) as { id: string; name: string; avatar?: string }[];
  const count = (text: string) => (
    <Pressable testID="profile-mutual-open" accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setOpened(true)} style={{ minHeight: 44, justifyContent: "center", marginVertical: -12 }}>
      <AText size={13} line={20} weight="medium" color={ink.ink} style={{ textDecorationLine: "underline" }}>
        {text}
      </AText>
    </Pressable>
  );
  return (
    <Section first={first} title={t`In common`} label={t`Servers and friends in common`}>
      {!s.length && !f.length ? (
        <AText testID="mutual-none" size={13} line={20} color={ink.ink2}>
          {t`No servers or friends in common.`}
        </AText>
      ) : !opened ? (
        <View testID="mutual-summary" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {s.length ? (
            <>
              <View style={{ flexDirection: "row", paddingStart: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {s.slice(0, 3).map((x) => (
                  <View key={x.id} style={{ marginStart: -8, borderRadius: 8, borderWidth: 2, borderColor: ink.ring }}>
                    <Avatar url={x.icon} name={x.name} size={20} square />
                  </View>
                ))}
              </View>
              {count(t`Servers: ${s.length}`)}
            </>
          ) : null}
          {s.length && f.length ? (
            <AText size={13} line={20} color={ink.muted} accessibilityElementsHidden>
              ·
            </AText>
          ) : null}
          {f.length ? count(t`Friends: ${f.length}`) : null}
        </View>
      ) : (
        <>
          {s.length ? (
            <View testID="mutual-servers" style={{ gap: 4 }}>
              <AText size={12} line={16} weight="medium" color={ink.muted}>
                {t`Servers`}
              </AText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {s.map((x) => (
                  <Chip
                    key={x.id}
                    label={x.name}
                    onPress={() => {
                      onLeave();
                      router.push({ pathname: "/server/[id]", params: { id: x.id } });
                    }}
                    leading={<Avatar url={x.icon} name={x.name} size={16} square />}
                  >
                    <ChipText>{x.name}</ChipText>
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          {f.length ? (
            <View testID="mutual-friends" style={{ gap: 4 }}>
              <AText size={12} line={16} weight="medium" color={ink.muted}>
                {t`Friends`}
              </AText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {f.map((x) => (
                  <Chip key={x.id} label={x.name} onPress={() => openProfile(x.id)} leading={<Avatar url={x.avatar} name={x.name} size={16} />}>
                    <ChipText>{x.name}</ChipText>
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Section>
  );
}

const MAX_NOTE = 256;

/** A note about someone for your eyes only, kept on this device */
function Note({ userId, first }: { userId: string; first: boolean }) {
  const { t, i18n } = useLingui();
  const ink = useInk();
  const { palette } = useTheme();
  const selfId = useSelfId();
  const key = `zrzur.note.${selfId ?? "me"}.${userId}`;
  const [value, setValue] = useState<{ key: string; text: string } | null>(null);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    secureStorage
      .get(key)
      .then((text) => alive && setValue({ key, text: text ?? "" }))
      .catch(() => alive && setValue({ key, text: "" }));
    return () => {
      alive = false;
    };
  }, [key]);
  const write = (text: string) => {
    setValue({ key, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (text.trim() ? secureStorage.set(key, text) : secureStorage.remove(key)).catch(() => {});
    }, 400);
  };
  const text = value?.key === key ? value.text : "";
  return (
    <Section first={first} title={t`Note`}>
      <TextInput
        testID="profile-note"
        multiline
        maxLength={MAX_NOTE}
        value={text}
        editable={value?.key === key}
        onChangeText={write}
        accessibilityLabel={t`Note`}
        placeholder={t`Add a note`}
        placeholderTextColor={ink.muted}
        selectionColor={palette.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          minHeight: 64,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: focused ? (ink.themed ? ink.ink : palette.focus) : ink.line,
          backgroundColor: ink.chip,
          color: ink.ink,
          fontSize: 16,
          lineHeight: 22,
          textAlignVertical: "top",
          fontFamily: fontFamily(i18n.locale),
          ...inputDirStyle(text),
        }}
      />
      <AText size={12} line={16} color={ink.muted}>
        {t`Only you can see this. It stays on this device.`}
      </AText>
    </Section>
  );
}

/**
 * Everything below the name (web ProfileBody, full): the person's sections
 * in their order, then roles here, what you share, and your note.
 */
export function ProfileBody({
  user,
  member,
  profile,
  state,
  self,
  onLeave,
  onRetry,
}: {
  user: User;
  member?: ServerMember;
  profile?: FullProfile;
  state: "loading" | "error" | "ready";
  self: boolean;
  onLeave: () => void;
  onRetry: () => void;
}) {
  const { t } = useLingui();
  const ink = useInk();
  if (state === "loading") return <ProfileSkeleton />;
  const sections = visibleSections(profile?.sections);
  const interests = interestsAt(sections);
  // the first drawn part has no line above it: track it while building
  const parts: { key: string; draw: (first: boolean) => React.ReactNode }[] = [];
  if (state === "error")
    parts.push({
      key: "error",
      draw: () => (
        <View testID="profile-load-error" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AText size={13} line={20} color={ink.ink2} style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {t`Couldn't load this profile.`}
          </AText>
          <ProfileButton testID="profile-retry" label={t`Try again`} onPress={onRetry} />
        </View>
      ),
    });
  for (const id of sections) {
    if (id === "member_since") parts.push({ key: id, draw: (first) => <Joined user={user} member={member} first={first} /> });
    else if (id === "about" && profile?.content) parts.push({ key: id, draw: (first) => <Bio content={profile.content} first={first} /> });
    else if (id === "links" && profile && safeProfileLinks(profile.links).length) parts.push({ key: id, draw: (first) => <Links links={profile.links} first={first} /> });
    else if (id === interests && profile && (profile.games || profile.connections.length)) parts.push({ key: "interests", draw: (first) => <Interests profile={profile} first={first} /> });
  }
  // a bot: About this bot, Created by, Commands (web: before Roles)
  if (user.bot) parts.push({ key: "bot", draw: (first) => <BotSections user={user} first={first} /> });
  if (member) parts.push({ key: "roles", draw: (first) => <Roles member={member} first={first} /> });
  if (!self) parts.push({ key: "mutual", draw: (first) => <Mutuals user={user} onLeave={onLeave} first={first} /> });
  if (!self) parts.push({ key: "note", draw: (first) => <Note userId={user.id} first={first} /> });
  return <View style={{ gap: 12 }}>{parts.map((p, i) => <View key={p.key}>{p.draw(i === 0)}</View>)}</View>;
}
