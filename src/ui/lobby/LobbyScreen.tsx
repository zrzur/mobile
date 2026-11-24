import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { LobbySection, Server } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { MessageContent } from "@/chat/MessageContent";
import { useClient } from "@/client/ClientProvider";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { useFields, useServer } from "@/client/hooks";
import { secureStorage } from "@/lib/secureStorage";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { useNow } from "@/ui/events/useNow";
import { isRTL } from "@/ui/kit/direction";
import { openProfile } from "@/ui/server/home";
import { contrast, inkOn, isLobbyColour } from "@/ui/settings/lobby";

import {
  FACES,
  filterFaq,
  greetingKind,
  introChannel,
  isLive,
  jumpBack,
  type LobbyChannel,
  type LobbyLook,
  type LobbyMember,
  lobbyLook,
  lobbyNumber,
  lobbySections,
  mainChannels,
  mix,
  memberCount,
  newcomers,
  newsChannel,
  parseSteps,
  phoneOrder,
  relativeTime,
  showStart,
  staffGroups,
  startSteps,
  type StepId,
  ulidTime,
  voiceRooms,
} from "./lobbyLogic";

const stepsKey = (serverId: string) => `zrzur.lobby-steps.${serverId}`;

/** Steps this member finished, kept on this device only */
function useSteps(serverId: string) {
  const [done, setDone] = useState<StepId[]>([]);
  useEffect(() => {
    let live = true;
    secureStorage
      .get(stepsKey(serverId))
      .catch(() => null)
      .then((raw) => live && setDone(parseSteps(raw)));
    return () => {
      live = false;
    };
  }, [serverId]);
  const mark = (step: StepId) => {
    if (done.includes(step)) return;
    const next = [...done, step];
    setDone(next);
    void secureStorage.set(stepsKey(serverId), JSON.stringify(next)).catch(() => {});
  };
  return { done, mark };
}

/** A snapshot of what the lobby shows: re-renders only when it changes */
function useLobbySnapshot(server: Server | undefined) {
  const client = useClient();
  return useFields(
    server,
    (s) => ({
      name: s.name,
      banner: s.bannerURL,
      icon: s.animatedIconURL ?? s.iconURL,
      lobby: JSON.parse(JSON.stringify(s.lobby ?? {})) as NonNullable<Server["lobby"]>,
      description: s.description?.trim() ?? "",
      approx: s.approximateMemberCount,
      wings: s.supercharge?.level ?? 0,
      rulesId: s.rulesChannelId,
      mustAccept: s.mustAcceptRules,
      canManage: s.havePermission("ManageServer"),
      canInvite: s.havePermission("InviteOthers"),
      joinedAt: s.member?.joinedAt.getTime(),
      owner: s.owner ? { id: s.owner.id, name: s.owner.displayName ?? s.owner.username } : undefined,
      staffRoles: (s.lobby?.staff_roles ?? []).map((id) => s.roles.get(id)).filter((r) => !!r).map((r) => ({ id: r!.id, name: r!.name, colour: r!.colour ?? undefined, rank: r!.rank })),
      unreadsKnown: (client.channelUnreads as unknown as { loaded?: boolean }).loaded === true,
      me: { name: client.user?.displayName ?? client.user?.username ?? "", avatar: !!client.user?.avatar },
      channels: s.channels.map(
        (c): LobbyChannel => ({
          id: c.id,
          name: c.name,
          voice: c.isVoice,
          announcement: c.announcement,
          readable: c.havePermission("ViewChannel"),
          canSend: c.havePermission("SendMessage"),
          unread: c.unread,
          mentions: c.mentions?.size ?? 0,
          lastMessageId: c.lastMessageId,
          voiceUsers: c.isVoice ? [...c.voiceParticipants.values()].map((p) => p.userId) : [],
        }),
      ),
    }),
    [client],
  );
}

type Snap = NonNullable<ReturnType<typeof useLobbySnapshot>>;

/** The tick on a done step: the web's fixed dark ink on the success fill */
const DARK_INK = "#0D0E16";

/**
 * No banner picture (web: BannerArt): a diagonal wash from the raised
 * surface into the accent, an accent glow at the top end and two thin rings.
 */
function BannerArt({ height, radius, accent }: { height: number; radius: number; accent: string }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const rtl = isRTL();
  // the rings sit at the end side (web: inset-inline-end -30 / 40, r 180)
  const ringX = (inset: number) => (rtl ? inset + 180 : width - inset - 180);
  return (
    <View accessible={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, borderRadius: radius, overflow: "hidden", backgroundColor: palette.field }}>
      {width ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="wash" x1="0" y1="0" x2="1" y2="0.6">
              <Stop offset="0" stopColor={palette.field} />
              <Stop offset="1" stopColor={mix(accent, palette.frame, 0.28)} />
            </LinearGradient>
            <RadialGradient id="glow" cx={rtl ? "0.15" : "0.85"} cy="0.1" rx="0.65" ry="0.9">
              <Stop offset="0" stopColor={accent} stopOpacity={0.65} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#wash)" />
          <Rect x={0} y={0} width={width} height={height} fill="url(#glow)" />
          <Circle cx={ringX(-30)} cy={-40} r={180} stroke={palette.mark} strokeOpacity={0.12} strokeWidth={1} fill="none" />
          <Circle cx={ringX(40)} cy={5} r={180} stroke={palette.mark} strokeOpacity={0.08} strokeWidth={1} fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}

/** A box of the lobby (web: Card): 16 px on a phone */
function Card({ look, children, testID }: { look: LobbyLook; children: ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return <View testID={testID} style={{ padding: 16, gap: 16, borderRadius: look.radius, backgroundColor: look.card ?? palette.field }}>{children}</View>;
}

function useInk(look: LobbyLook) {
  const { palette } = useTheme();
  return { fg: look.ink ?? palette.fg, fg2: look.ink ?? palette.fg2, muted: look.ink ?? palette.muted, heading: look.heading ?? palette.accentText };
}

function CardTitle({ look, icon, dot, children, aside }: { look: LobbyLook; icon?: IconName; dot?: boolean; children: string; aside?: ReactNode }) {
  const { palette } = useTheme();
  const ink = useInk(look);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.online }} /> : null}
        {icon ? <Icon name={icon} size={16} color={ink.heading} /> : null}
        <AText size={15} line={20} weight="bold" color={ink.fg} accessibilityRole="header">
          {children}
        </AText>
      </View>
      {aside}
    </View>
  );
}

function TextLink({ look, label, onPress }: { look: LobbyLook; label: string; onPress: () => void }) {
  const ink = useInk(look);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={{ alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <AText size={14} line={20} weight="bold" color={ink.heading}>
        {label}
      </AText>
      <Icon name="caret-right" size={14} color={ink.heading} />
    </Pressable>
  );
}

/** One channel or room as a tile (web: Tile / ChannelTile) */
function Tile({ look, icon, title, line, lineLive, unread, aside, onPress }: { look: LobbyLook; icon: ReactNode; title: string; line: string; lineLive?: boolean; unread?: boolean; aside?: ReactNode; onPress: () => void }) {
  const { palette } = useTheme();
  const ink = useInk(look);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        padding: 16,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: unread ? (look.accent ?? palette.accent) : palette.fieldBorder,
        backgroundColor: pressed ? palette.navHover : look.page ? "transparent" : palette.frame,
      })}
    >
      <View style={{ width: 24, alignItems: "center" }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText autoDir size={14} line={20} weight="bold" color={ink.fg} numberOfLines={1}>
          {title}
        </AText>
        <AText size={12} line={16} weight={lineLive ? "semibold" : "regular"} color={lineLive ? palette.onlineText : ink.muted} numberOfLines={1}>
          {line}
        </AText>
      </View>
      {aside ?? <Icon name="caret-right" size={16} color={ink.muted} />}
    </Pressable>
  );
}

/** The ring that fills as steps are done (web: Progress) */
function Progress({ done, total, colour, label }: { done: number; total: number; colour: string; label: string }) {
  const { palette } = useTheme();
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
      <Svg width={40} height={40} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={20} cy={20} r={r} stroke={palette.tonal} strokeWidth={5} fill="none" />
        <Circle cx={20} cy={20} r={r} stroke={colour} strokeWidth={5} fill="none" strokeDasharray={`${(done / total) * c} ${c}`} />
      </Svg>
      <AText size={11} line={14} weight="bold" color={palette.fg2}>
        {`${done}/${total}`}
      </AText>
    </View>
  );
}

/** A server's lobby: its first page (web: Lobby) */
export function LobbyScreen({ serverId }: { serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const snap = useLobbySnapshot(server);
  useEffect(() => {
    // the server is gone (left, removed): back home, once the session is ready
    if (!server && client.ready()) router.replace("/home");
  }, [server, client]);
  if (!server || !snap) return null;
  const look = lobbyLook(snap.lobby, isLobbyColour, inkOn, contrast);
  return (
    <SafeAreaView testID="lobby" style={{ flex: 1, backgroundColor: look.page ?? palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <Icon name="house" size={20} color={palette.iconMuted} />
        <AText size={15} line={20} weight="bold" color={palette.header} accessibilityRole="header">
          {t`Lobby`}
        </AText>
        {/* the server's name at the end of the header (a spacer, so the text keeps its start alignment) */}
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end", paddingEnd: 4 }}>
          <AText autoDir size={13} line={18} weight="medium" color={palette.muted} numberOfLines={1}>
            {snap.name}
          </AText>
        </View>
      </ScreenHeader>
      <Lobby server={server} snap={snap} look={look} />
    </SafeAreaView>
  );
}

function Lobby({ server, snap, look }: { server: Server; snap: Snap; look: LobbyLook }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const now = useNow(60_000);
  const steps = useSteps(server.id);
  const ink = useInk(look);
  const lobby = snap.lobby;
  const appearance = lobby.appearance ?? {};
  const sections = lobbySections(lobby);
  const shows = (s: LobbySection) => sections.includes(s);
  const open = (id: string) => {
    const c = server.channels.find((x) => x.id === id);
    router.push(anyChannelRoute({ id, isForum: c?.isForum, isThread: c?.isThread, isVoice: c?.isVoice }));
  };

  const channels = snap.channels;
  const byId = new Map(channels.map((c) => [c.id, c]));
  const rooms = voiceRooms(channels);
  const inVoice = rooms.reduce((n, r) => n + r.voiceUsers.length, 0);
  const main = mainChannels(channels, lobby.channels, appearance.channel_limit ?? undefined);
  const back = jumpBack(channels);
  const actions = (lobby.actions ?? []).filter((a) => byId.get(a.channel)?.readable);
  const rulesChannel = snap.rulesId ? byId.get(snap.rulesId) : undefined;
  const rules = rulesChannel?.readable ? rulesChannel : undefined;
  const intro = introChannel(channels, lobby.intro_channel, lobby.actions?.[0]?.channel, main);
  const firstVoice = rooms[0] ?? channels.find((c) => c.voice && c.readable);
  const start = startSteps({ rules, rulesReadKnown: snap.unreadsKnown, hello: intro, voice: firstVoice, hasAvatar: snap.me.avatar, done: steps.done });
  const stepsDone = start.filter((s) => s.done).length;
  const news = newsChannel(channels, lobby.news_channel);
  const inviteChannel = snap.canInvite ? (intro ?? main[0]) : undefined;

  const relative = (time: number) => relativeTime(time, now, i18n.locale);
  const ago = (id?: string) => (!id ? t`No messages yet` : isLive(id, now) ? t`Active now` : t`Active ${relative(ulidTime(id))}`);

  // latest news: the newest message of the news channel
  const [newsMessage, setNewsMessage] = useState<{ key: string; name: string; avatar?: string; content: string; at: number } | null>(null);
  const newsKey = shows("News") && news ? `${news.id}:${news.lastMessageId ?? ""}` : "";
  useEffect(() => {
    if (!newsKey) return;
    const channel = server.channels.find((c) => c.id === newsKey.split(":")[0]);
    if (!channel) return;
    let live = true;
    channel
      .fetchMessages({ limit: 1 })
      .then((list) => {
        const m = list[0];
        if (live && m) setNewsMessage({ key: newsKey, name: m.username ?? "", avatar: m.avatarURL, content: m.content, at: m.createdAt.getTime() });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [newsKey, server]);

  // members: for the team and this week's arrivals
  const wantMembers = (shows("Team") && (lobby.staff_roles?.length ?? 0) > 0) || shows("Newcomers");
  const [members, setMembers] = useState<LobbyMember[] | undefined>();
  useEffect(() => {
    if (!wantMembers) return;
    let live = true;
    server
      .fetchMembers()
      .then((r) => {
        if (!live) return;
        setMembers(
          r.members.map((m) => ({ userId: m.id.user, name: m.displayName ?? m.user?.displayName ?? "", joinedAt: m.joinedAt.getTime(), roles: [...m.roles], bot: !!m.user?.bot, avatar: m.avatarURL ?? m.user?.avatarURL })),
        );
      })
      .catch(() => live && setMembers([]));
    return () => {
      live = false;
    };
  }, [wantMembers, server]);

  const arrivals = newcomers(members ?? [], now);
  const staff = staffGroups(snap.owner, snap.staffRoles, members ?? []);
  const count = memberCount(snap.approx, members?.length);
  const [faqQuery, setFaqQuery] = useState("");
  const faq = filterFaq(lobby.faq ?? [], faqQuery);
  const [openFaq, setOpenFaq] = useState<number[]>([]);
  const [acceptError, setAcceptError] = useState<string>();

  const stepLabel = (id: StepId, name?: string) => (id === "rules" ? t`Read the rules` : id === "hello" ? t`Say hello in #${name}` : id === "voice" ? t`Drop into a voice room` : t`Add a profile picture`);

  const SECTIONS: Record<LobbySection, () => ReactNode> = {
    Start: () =>
      showStart(start) ? (
        <Card look={look} key="Start">
          <CardTitle look={look} aside={<Progress done={stepsDone} total={start.length} colour={look.accent ?? palette.accent} label={t`${stepsDone} of ${start.length} done`} />}>
            {t`Start here`}
          </CardTitle>
          <View style={{ gap: 2 }}>
            {start.map((step) => (
              <Pressable
                key={step.id}
                accessibilityRole="button"
                accessibilityState={{ checked: step.done }}
                onPress={() => {
                  if (step.id === "profile") return router.push("/settings-profile");
                  steps.mark(step.id);
                  if (step.channel) open(step.channel.id);
                }}
                style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, marginHorizontal: -8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? palette.navHover : "transparent" })}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: step.done ? 0 : 2, borderColor: palette.borderStrong, backgroundColor: step.done ? palette.online : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {step.done ? <Icon name="check" size={14} color={DARK_INK} /> : null}
                </View>
                <AText size={15} line={20} weight={step.done ? "medium" : "semibold"} color={step.done ? ink.muted : ink.fg} style={{ flex: 1, textDecorationLine: step.done ? "line-through" : "none" }}>
                  {stepLabel(step.id, step.channel?.name)}
                </AText>
                {!step.done ? <Icon name="caret-right" size={16} color={ink.muted} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null,
    News: () =>
      newsMessage && newsMessage.key === newsKey && news ? (
        <Card look={look} key="News">
          <CardTitle
            look={look}
            icon="megaphone"
            aside={
              <AText size={13} line={18} color={ink.muted}>
                {relative(newsMessage.at)}
              </AText>
            }
          >
            {t`Latest news`}
          </CardTitle>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Avatar url={newsMessage.avatar} name={newsMessage.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AText size={15} line={20} weight="bold" color={ink.fg}>
                {newsMessage.name}
              </AText>
              <View style={{ maxHeight: 132, overflow: "hidden" }}>
                <MessageContent content={newsMessage.content} />
              </View>
            </View>
          </View>
          <TextLink look={look} label={t`Read in #${news.name}`} onPress={() => open(news.id)} />
        </Card>
      ) : null,
    About: () =>
      lobby.about ? (
        <Card look={look} key="About">
          <CardTitle look={look}>{t`About`}</CardTitle>
          <MessageContent content={lobby.about} />
        </Card>
      ) : null,
    Live: () =>
      rooms.length ? (
        <Card look={look} key="Live">
          <CardTitle look={look} dot>
            {t`Live now`}
          </CardTitle>
          <View style={{ gap: 8 }}>
            {rooms.map((room) => (
              <Tile
                key={room.id}
                look={look}
                icon={<Icon name="speaker-high" size={18} color={ink.heading} />}
                title={room.name}
                line={t`${room.voiceUsers.length} in voice`}
                lineLive
                onPress={() => open(room.id)}
                aside={<Faces ids={room.voiceUsers} />}
              />
            ))}
          </View>
        </Card>
      ) : null,
    Channels: () =>
      main.length ? (
        <Card look={look} key="Channels">
          <CardTitle look={look}>{t`Main channels`}</CardTitle>
          <ChannelTiles look={look} list={main} rulesId={snap.rulesId} ago={ago} now={now} open={open} />
        </Card>
      ) : null,
    Questions: () =>
      lobby.faq?.length ? (
        <Card look={look} key="Questions">
          <CardTitle look={look}>{t`Questions and answers`}</CardTitle>
          {lobby.faq.length > 6 ? (
            <TextInput
              value={faqQuery}
              onChangeText={setFaqQuery}
              placeholder={t`Search questions`}
              accessibilityLabel={t`Search questions`}
              placeholderTextColor={palette.muted}
              style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.field, color: palette.fg, fontSize: 16, fontFamily: fontFamily(i18n.locale), ...inputDirStyle(faqQuery) }}
            />
          ) : null}
          <View style={{ gap: 8 }}>
            {faq.length ? (
              faq.map((entry) => {
                const index = (lobby.faq ?? []).indexOf(entry);
                const opened = openFaq.includes(index);
                return (
                  <View key={index} style={{ borderRadius: 10, borderWidth: 1, borderColor: palette.fieldBorder, overflow: "hidden" }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: opened }}
                      onPress={() => setOpenFaq(opened ? openFaq.filter((i) => i !== index) : [...openFaq, index])}
                      style={{ minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
                    >
                      <AText size={14} line={20} weight="bold" color={ink.fg} style={{ flex: 1 }}>
                        {entry.question}
                      </AText>
                      <View style={{ transform: [{ rotate: opened ? "180deg" : "0deg" }] }}>
                        <Icon name="caret-down" size={16} color={ink.muted} />
                      </View>
                    </Pressable>
                    {opened ? (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        <MessageContent content={entry.answer} />
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <AText size={13} line={18} color={ink.muted}>
                {t`No question matches.`}
              </AText>
            )}
          </View>
        </Card>
      ) : null,
    Newcomers: () =>
      arrivals.length ? (
        <Card look={look} key="Newcomers">
          <CardTitle
            look={look}
            aside={
              <AText size={13} line={18} color={ink.muted}>
                {t`${plural(arrivals.length, { one: "# new member", other: "# new members" })}`}
              </AText>
            }
          >
            {t`New this week`}
          </CardTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {arrivals.slice(0, appearance.newcomer_limit ?? 12).map((m) => (
              <Pressable
                key={m.userId}
                accessibilityRole="button"
                accessibilityLabel={`${m.name} · ${relative(m.joinedAt)}`}
                onPress={() => openProfile(m.userId, server.id)}
                style={({ pressed }) => ({ width: 76, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, alignItems: "center", gap: 8, backgroundColor: pressed ? palette.navHover : look.page ? "transparent" : palette.frame })}
              >
                <Avatar url={m.avatar} name={m.name} size={44} />
                <AText autoDir size={12} line={16} weight="semibold" color={ink.fg2} numberOfLines={1}>
                  {m.name}
                </AText>
              </Pressable>
            ))}
          </View>
          {intro ? <TextLink look={look} label={t`Welcome them in #${intro.name}`} onPress={() => open(intro.id)} /> : null}
        </Card>
      ) : null,
    Team: () =>
      staff.length ? (
        <Card look={look} key="Team">
          <CardTitle look={look}>{t`Who runs it`}</CardTitle>
          {staff.flatMap((group) =>
            group.people.map((person) => (
              <Pressable
                key={`${group.key}-${person.id}`}
                accessibilityRole="button"
                onPress={() => openProfile(person.id, server.id)}
                style={({ pressed }) => ({ minHeight: 48, paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? palette.navHover : "transparent" })}
              >
                <PersonAvatar id={person.id} name={person.name} avatar={person.member?.avatar} />
                <AText autoDir size={14} line={20} weight="bold" color={ink.fg} numberOfLines={1} style={{ flex: 1 }}>
                  {person.name}
                </AText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <Icon name={group.owner ? "crown" : "shield"} size={14} color={group.owner ? palette.warningText : group.colour && isLobbyColour(group.colour) ? group.colour : ink.muted} />
                  <AText size={12} line={16} weight="bold" color={group.owner ? palette.warningText : group.colour && isLobbyColour(group.colour) ? group.colour : ink.muted}>
                    {group.owner ? t`Owner` : (group.label ?? "")}
                  </AText>
                </View>
              </Pressable>
            )),
          )}
        </Card>
      ) : null,
  };

  const order = phoneOrder(sections);
  const actionButton = (key: string, label: string, onPress: () => void, opts: { main?: boolean; icon?: IconName; emoji?: string; quiet?: boolean; testID?: string } = {}) => (
    <Pressable
      key={key}
      testID={opts.testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: opts.quiet ? 0 : 1,
        flexBasis: opts.main ? "70%" : "auto",
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: opts.quiet ? 0 : 16,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: opts.main ? 0 : 1,
        borderColor: palette.tonalBorder,
        backgroundColor: opts.main ? (pressed ? palette.accentPressed : palette.accent) : pressed ? palette.tonalHover : opts.quiet ? "transparent" : palette.tonal,
      })}
    >
      {opts.emoji ? <AText size={15} line={20} color={palette.fg}>{opts.emoji}</AText> : null}
      {opts.icon ? <Icon name={opts.icon} size={18} color={opts.main ? palette.onAccent : opts.quiet ? palette.fg2 : palette.fg} /> : null}
      {opts.quiet ? null : (
        <AText size={15} line={20} weight="semibold" color={opts.main ? palette.onAccent : palette.fg} numberOfLines={1}>
          {label}
        </AText>
      )}
      {opts.main && opts.icon === "hash" ? <Icon name="caret-right" size={16} color={palette.onAccent} /> : null}
    </Pressable>
  );

  const showChat = appearance.show_chat !== false && !!intro;
  const buttons: ReactNode[] = [];
  // phone: the main action first, the managers' edit icon beside it, the rest after
  if (showChat) buttons.push(actionButton("chat", t`Open chat`, () => open(intro!.id), { main: true, icon: "hash" }));
  if (snap.mustAccept)
    buttons.push(
      actionButton(
        "accept",
        t`Accept the rules`,
        () => {
          setAcceptError(undefined);
          server.acceptRules().catch((err) => setAcceptError(describeError(err)));
        },
        { main: !showChat, icon: "check", testID: "lobby-accept-rules" },
      ),
    );
  if (snap.canManage) buttons.push(actionButton("edit", t`Edit lobby`, () => router.push({ pathname: "/server-section/[id]/[section]", params: { id: server.id, section: "joining" } }), { quiet: true, icon: "pencil-simple", testID: "lobby-edit" }));
  if (rules) buttons.push(actionButton("rules", t`Read the rules`, () => open(rules.id), { icon: "book-check" }));
  actions.forEach((a, i) => buttons.push(actionButton(`action-${i}`, a.label, () => open(a.channel), { main: !intro && !rules && !snap.mustAccept && i === 0, emoji: a.emoji ?? undefined })));
  if (appearance.show_invite !== false && inviteChannel) buttons.push(actionButton("invite", t`Invite people`, () => router.push({ pathname: "/invite/[serverId]", params: { serverId: server.id } }), { icon: "user-plus" }));

  const userName = snap.me.name;
  const since = snap.joinedAt ? new Date(snap.joinedAt).toLocaleDateString(i18n.locale, { year: "numeric", month: "long" }) : "";

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 }}>
      {/* the banner: the server's picture, or the accent field */}
      {look.banner !== "Hidden" ? (
        look.banner !== "Gradient" && snap.banner ? (
          <View style={{ height: look.bannerHeight, borderRadius: look.radius, overflow: "hidden", backgroundColor: palette.field }}>
            <Image source={{ uri: snap.banner }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" priority="high" accessibilityIgnoresInvertColors />
          </View>
        ) : (
          <BannerArt height={look.bannerHeight} radius={look.radius} accent={look.accent ?? palette.accent} />
        )
      ) : null}
      <View style={{ marginTop: look.banner === "Hidden" ? 0 : -24, paddingBottom: 20, gap: 16, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingStart: 8 }}>
          <View style={{ borderRadius: 20, borderWidth: 6, borderColor: look.page ?? palette.frame, backgroundColor: palette.navSelected, overflow: "hidden" }}>
            <Avatar url={snap.icon} name={snap.name} size={64} square />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4, paddingTop: look.banner === "Hidden" ? 0 : 40, paddingBottom: 4 }}>
            <AText size={22} line={28} weight="bold" color={ink.fg} accessibilityRole="header">
              {snap.name}
            </AText>
            {lobby.tagline ? (
              <AText size={14} line={20} color={ink.fg2}>
                {lobby.tagline}
              </AText>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 }}>
              {appearance.show_member_count !== false ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="users" size={16} color={ink.muted} />
                  <AText size={13} line={18} weight="medium" color={ink.muted}>
                    {t`${plural(count, { one: "# member", other: "# members" })}`}
                  </AText>
                </View>
              ) : null}
              {inVoice ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.online }} />
                  <AText size={13} line={18} weight="medium" color={palette.onlineText}>
                    {t`${lobbyNumber(inVoice, i18n.locale)} in voice`}
                  </AText>
                </View>
              ) : null}
              {snap.wings ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="lightning" size={16} color={palette.warningText} />
                  <AText size={13} line={18} weight="medium" color={palette.warningText}>
                    {t`Wings level ${snap.wings}`}
                  </AText>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {buttons.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{buttons}</View> : null}
        {acceptError ? (
          <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
            {acceptError}
          </AText>
        ) : null}
      </View>

      <View style={{ paddingTop: 20, gap: look.gap }}>
        {appearance.show_greeting !== false && snap.joinedAt ? (
          <AText size={15} line={22} weight="semibold" color={ink.fg} style={{ paddingHorizontal: 2 }}>
            {greetingKind(snap.joinedAt, now) === "new" ? t`Welcome, ${userName}! Glad you are here.` : t`Welcome back, ${userName}. Member since ${since}.`}
          </AText>
        ) : null}
        {back.length ? (
          <Card look={look}>
            <CardTitle look={look}>{t`Jump back in`}</CardTitle>
            <ChannelTiles look={look} list={back} rulesId={snap.rulesId} ago={ago} now={now} open={open} />
          </Card>
        ) : null}
        {order.main.map((s) => SECTIONS[s]?.())}
        {snap.description ? <ServerAbout look={look} text={snap.description} /> : null}
        {order.side.map((s) => SECTIONS[s]?.())}
        {snap.canManage && !lobby.about && !lobby.faq?.length && !lobby.actions?.length ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 16, borderRadius: look.radius, borderWidth: 1, borderStyle: "dashed", borderColor: palette.borderStrong }}>
            <Icon name="paint-brush" size={18} color={ink.heading} />
            <AText size={14} line={20} color={ink.fg2} style={{ flex: 1 }}>
              {t`Make this page yours in Server settings, Lobby: a welcome text, buttons, questions and your team.`}
            </AText>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ChannelTiles({ look, list, rulesId, ago, now, open }: { look: LobbyLook; list: LobbyChannel[]; rulesId?: string; ago: (id?: string) => string; now: number; open: (id: string) => void }) {
  const { palette } = useTheme();
  const ink = useInk(look);
  return (
    <View style={{ gap: 8 }}>
      {list.map((c) => (
        <Tile
          key={c.id}
          look={look}
          icon={<Icon name={c.id === rulesId ? "book-check" : c.announcement ? "megaphone" : "hash"} size={18} color={ink.heading} />}
          title={c.name}
          line={ago(c.lastMessageId)}
          lineLive={isLive(c.lastMessageId, now)}
          unread={c.unread}
          onPress={() => open(c.id)}
          aside={
            c.mentions ? (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: palette.mentionBadge, alignItems: "center", justifyContent: "center" }}>
                <AText size={12} line={16} weight="bold" color={palette.onAccent}>
                  {String(c.mentions)}
                </AText>
              </View>
            ) : undefined
          }
        />
      ))}
    </View>
  );
}

/** Up to four faces of a voice room, then "+N" */
function Faces({ ids }: { ids: string[] }) {
  const { palette } = useTheme();
  const client = useClient();
  const people = useFields(client, (c) => ids.slice(0, FACES).map((id) => ({ id, url: c.users.get(id)?.avatarURL, name: c.users.get(id)?.displayName })), [ids.join(",")]) ?? [];
  return (
    <View style={{ flexDirection: "row" }}>
      {people.map((p, i) => (
        <View key={p.id} style={{ marginStart: i ? -8 : 0, borderRadius: 13, borderWidth: 2, borderColor: palette.field }}>
          <Avatar url={p.url} name={p.name} size={26} />
        </View>
      ))}
      {ids.length > FACES ? (
        <View style={{ marginStart: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: palette.tonal, alignItems: "center", justifyContent: "center" }}>
          <AText size={11} line={14} weight="bold" color={palette.fg2}>
            {`+${ids.length - FACES}`}
          </AText>
        </View>
      ) : null}
    </View>
  );
}

function PersonAvatar({ id, name, avatar }: { id: string; name: string; avatar?: string }) {
  const client = useClient();
  const user = useFields(client, (c) => ({ url: c.users.get(id)?.avatarURL, presence: c.users.get(id)?.presence }), [id]);
  return <Avatar url={avatar ?? user?.url} name={name} size={36} presence={user?.presence as never} />;
}

/** The server's own description, folded when long (web: ServerAbout) */
function ServerAbout({ look, text }: { look: LobbyLook; text: string }) {
  const { t } = useLingui();
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  const folded = useMemo(() => long && !open, [long, open]);
  return (
    <Card look={look}>
      <CardTitle look={look}>{t`About this server`}</CardTitle>
      <View
        style={folded ? { maxHeight: 240, overflow: "hidden" } : undefined}
        onLayout={(e) => {
          // a little slack: a fold that hides one line is worse than none
          if (!long && e.nativeEvent.layout.height > 240 + 48) setLong(true);
        }}
      >
        <MessageContent content={text} />
      </View>
      {long ? <TextLink look={look} label={open ? t`Show less` : t`Show more`} onPress={() => setOpen(!open)} /> : null}
    </Card>
  );
}
