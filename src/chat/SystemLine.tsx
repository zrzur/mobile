import { Trans, useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { rawSystem } from "@/sdk/rawSystem";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { openEvent } from "@/ui/events/EventCard";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { AText } from "@/ui/kit/Text";
import { openUserMenu, useOpenProfile } from "@/ui/profile/store";

import { callDuration, callLine } from "./callMessage";
import { glueEnd, isolate, lineDescent, lineFor, NBSP } from "./inlineRun";
import { MessageContent } from "./MessageContent";
import { usePollEndedText } from "./rich";

/**
 * A system line (web: messaging/elements/SystemMessage.tsx): the mark at the
 * end of the 48 px avatar column, then ONE paragraph of message text. Every
 * piece inside it (name pills, the channel chip, the call's duration, a bold
 * group name) is part of that paragraph, so the sentence wraps as one: no
 * piece ever drops to a line of its own, and every piece stands on the same
 * baseline as the words around it.
 *
 * - Name pills and channel chips are inline boxes exactly one line tall,
 *   like the web's `display: inline-flex; vertical-align: bottom` mention:
 *   they are moved down from the baseline (where the phone puts an inline
 *   view's bottom) to the bottom of the line (inlineRun.lineDescent).
 * - The call's duration is a text run with its own background, like the
 *   web's inline `time` span; the space before it is a no-break space.
 * - Names written by people are isolated (FSI … PDI), so an Arabic name in an
 *   English sentence, or the other way round, never turns the words around.
 */

/** Text size and line of a system line (web: message text, 16 px, 1.5) */
const SIZE = 16;
const LINE = 24;

/** On the web build the browser places the box itself, as the web does */
const WEB_ALIGN = (Platform.OS === "web" ? { verticalAlign: "bottom" } : null) as ViewStyle | null;

function useInlineBox(): ViewStyle {
  const { i18n } = useLingui();
  return Platform.OS === "web"
    ? { height: lineFor(i18n.locale, LINE) }
    : { height: lineFor(i18n.locale, LINE), transform: [{ translateY: lineDescent(i18n.locale, SIZE, LINE) }] };
}

/**
 * A person inside a system line: the web's UserMention, a pill with the
 * 16 px picture and the name in its own direction. A tap opens the profile,
 * a hold the person's menu (web: user card and context menu).
 */
export function SysName({ id, v, avatar, serverId }: { id?: string; v: string; avatar?: string; serverId?: string }) {
  const { palette } = useTheme();
  const openProfile = useOpenProfile();
  const box = useInlineBox();
  return (
    <Pressable
      testID="system-user"
      accessibilityRole="button"
      accessibilityLabel={v}
      disabled={!id}
      onPress={id ? () => openProfile(id, serverId) : undefined}
      onLongPress={id ? () => openUserMenu(id, serverId) : undefined}
      delayLongPress={300}
      // the pill sits in a line of text (24 px): the touch box reaches 44 px on a phone
      hitSlop={{ top: 10, bottom: 10 }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingStart: 4,
          paddingEnd: 8,
          borderRadius: 12,
          maxWidth: 240,
          backgroundColor: palette.mentionBg,
          opacity: pressed ? 0.7 : 1,
        },
        box,
        WEB_ALIGN,
      ]}
    >
      <Avatar url={avatar} name={v} size={16} />
      <AText autoDir size={SIZE} line={LINE} weight="semibold" color={palette.accentText} numberOfLines={1} style={{ flexShrink: 1 }}>
        {v}
      </AText>
    </Pressable>
  );
}

/**
 * A channel inside a system line (web RenderAnchor's internal link): an
 * accent chip with the channel's mark and name; a message link adds › and a
 * speech bubble. A tap goes there.
 */
export function SysChannelLink({ name, voice, message, onPress }: { name: string; voice: boolean; message?: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const box = useInlineBox();
  return (
    <Pressable
      testID={message ? "system-message-link" : "system-channel-link"}
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingStart: 4,
          paddingEnd: 8,
          borderRadius: 12,
          maxWidth: 260,
          backgroundColor: palette.accent,
          opacity: pressed ? 0.8 : 1,
        },
        box,
        WEB_ALIGN,
      ]}
    >
      <Icon name={voice ? "speaker-high" : "hash"} size={16} color={palette.onAccent} />
      <AText autoDir size={SIZE} line={LINE} weight="semibold" color={palette.onAccent} numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </AText>
      {message ? (
        <>
          <Icon name="caret-right" size={14} color={palette.onAccent} />
          <Icon name="chat-circle" size={14} color={palette.onAccent} />
        </>
      ) : null}
    </Pressable>
  );
}

/**
 * How long a call lasted (web: the `time` span, inline code look): a text
 * run with its own background inside the sentence, padded by no-break
 * spaces, so it sits on the line's baseline and wraps with the words.
 */
export function SysDuration({ v }: { v: string }) {
  const { palette } = useTheme();
  return (
    <Text testID="call-duration" style={{ backgroundColor: palette.field, color: palette.fg }}>
      {`${NBSP}${v}${NBSP}`}
    </Text>
  );
}

/** The mark at the end of the avatar column (web: SystemMessageIcon) */
export function systemMark(type: string, server: boolean, missed = false): { icon: IconName; tone: "accent" | "danger" | "muted" | "warning" | "live" } {
  switch (type) {
    case "user_added":
      return { icon: "plus", tone: "accent" };
    case "user_left":
      return server ? { icon: "arrow-left", tone: "danger" } : { icon: "minus", tone: "danger" };
    case "user_remove":
      return { icon: "x", tone: "accent" };
    case "user_kicked":
      return { icon: "x-circle", tone: "danger" };
    case "user_banned":
      return { icon: "warning-octagon", tone: "danger" };
    case "user_joined":
      return { icon: "arrow-right", tone: "accent" };
    case "channel_renamed":
      return { icon: "hash", tone: "accent" };
    case "channel_description_changed":
      return { icon: "list", tone: "accent" };
    case "channel_icon_changed":
      return { icon: "image", tone: "accent" };
    case "channel_ownership_changed":
      return { icon: "key", tone: "accent" };
    case "message_pinned":
    case "message_unpinned":
      return { icon: "push-pin", tone: "accent" };
    case "call_started":
      // a missed call: the hung-up phone (web: phone-disconnect)
      return { icon: missed ? "phone-disconnect" : "phone", tone: "accent" };
    case "event_started":
      return { icon: "calendar", tone: "live" };
    case "raid_alert":
      return { icon: "warning-circle", tone: "warning" };
    case "poll_ended":
      return { icon: "list-checks", tone: "accent" };
    case "automod_alert":
      return { icon: "shield-check", tone: "warning" };
    case "text":
      return { icon: "chat-circle", tone: "muted" };
    default:
      return { icon: "chat-circle", tone: "accent" };
  }
}

/** "The poll … ended" (web PollEnded) */
function PollEndedText({ question, winners, votes, total }: { question: string; winners: string[]; votes: number; total: number }) {
  return <>{usePollEndedText({ question, winners, votes, total })}</>;
}

/**
 * Many people joined in a short time (web RaidAlert): the warning, and for
 * people who can manage the server, Ignore or Pause invites for an hour.
 */
function RaidAlert(props: { joins: number; minutes: number; serverId?: string }) {
  const { serverId } = props;
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = serverId ? client.servers.get(serverId) : undefined;
  const canAct = useFields(server, (s) => s.havePermission("ManageServer")) ?? false;
  const [state, setState] = useState<"open" | "pending" | "paused" | "ignored">("open");
  const [error, setError] = useState<string>();
  const pause = async () => {
    if (!server) return;
    setState("pending");
    setError(undefined);
    try {
      await server.pauseSafety({ invitesHours: 1 });
      setState("paused");
    } catch (err) {
      setError(describeError(err));
      setState("open");
    }
  };
  return (
    <View testID="raid-alert" accessibilityRole="summary" style={{ flex: 1, gap: 8 }}>
      <AText size={SIZE} line={LINE} color={palette.warningText}>
        {t`${props.joins} people joined within ${props.minutes} min. This can be a raid.`}
      </AText>
      {canAct && state !== "ignored" ? (
        state === "paused" ? (
          <AText size={14} line={20} color={palette.fg2}>
            {t`Invites are paused for 1 hour.`}
          </AText>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button size="sm" variant="ghost" label={t`Ignore`} disabled={state === "pending"} onPress={() => setState("ignored")} testID="raid-ignore" />
            <Button size="sm" label={t`Pause invites`} status={state === "pending" ? "submitting" : "ready"} onPress={() => void pause()} testID="raid-pause" />
          </View>
        )
      ) : null}
      {error ? (
        <AText size={14} line={20} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}
    </View>
  );
}

type SysUser = { displayName?: string; username?: string; avatarURL?: string; bot?: unknown };

type SysFields = {
  type: string;
  user?: SysUser;
  userId?: string;
  by?: SysUser;
  from?: SysUser;
  to?: SysUser;
  fromId?: string;
  toId?: string;
  messageId?: string;
  byId?: string;
  startedAt?: Date;
  finishedAt?: Date | null;
  content?: string;
  name?: string;
  question?: string;
  winners?: string[];
  votes?: number;
  total?: number;
  // automod_alert
  rule?: string;
  channelId?: string;
  // event_started
  eventId?: string;
  title?: string;
  serverId?: string;
  // raid_alert
  joins?: number;
  minutes?: number;
};

export function SystemLine({ message, selfId, serverId, onJump }: { message: Message; selfId?: string; serverId?: string; onJump?: (id: string) => void }) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  const client = useClient();
  const fields = useFields(
    message,
    (m) => {
      const s = m.systemMessage as unknown as SysFields | undefined;
      const who = (u?: SysUser) => u?.displayName ?? u?.username ?? "…";
      // the SDK drops `missed`: read the API's own object (backend CallStarted { by, finished_at, missed })
      const raw = rawSystem(s);
      const call =
        s?.type === "call_started"
          ? callLine(
              {
                by: s.byId ?? (typeof raw?.by === "string" ? raw.by : undefined),
                finished_at: typeof raw?.finished_at === "string" ? raw.finished_at : (s.finishedAt?.toISOString() ?? null),
                missed: raw?.missed === true,
              },
              s.startedAt?.getTime() ?? m.createdAt.getTime(),
              selfId,
            )
          : undefined;
      const flagged = s?.type === "automod_alert" && s.channelId ? client.channels.get(s.channelId) : undefined;
      return {
        server: !!m.channel?.serverId,
        serverId: m.channel?.serverId,
        type: s?.type ?? "text",
        user: who(s?.user),
        userId: s?.userId,
        userAvatar: s?.user?.avatarURL,
        userBot: !!s?.user?.bot,
        by: who(s?.by),
        byId: s?.byId,
        byAvatar: s?.by?.avatarURL,
        from: who(s?.from),
        fromId: s?.fromId,
        fromAvatar: s?.from?.avatarURL,
        to: who(s?.to),
        toId: s?.toId,
        toAvatar: s?.to?.avatarURL,
        // people the line names who are not loaded yet (their chip shows "…" until fetched)
        missing: [
          [s?.userId, s?.user],
          [s?.byId, s?.by],
          [s?.fromId, s?.from],
          [s?.toId, s?.to],
        ]
          .filter(([id, u]) => typeof id === "string" && !u)
          .map(([id]) => id as string),
        messageId: s?.messageId,
        channelId: m.channelId,
        channelName: m.channel?.name ?? "",
        channelVoice: !!m.channel?.isVoice,
        call,
        content: s?.content ?? "",
        name: s?.name ?? "",
        question: s?.question ?? "",
        winners: s?.winners ? [...s.winners] : [],
        votes: Number(s?.votes ?? 0),
        total: Number(s?.total ?? 0),
        rule: s?.rule ?? "",
        flaggedId: s?.type === "automod_alert" ? s.channelId : undefined,
        flaggedName: flagged?.name ?? "",
        flaggedVoice: !!flagged?.isVoice,
        eventId: s?.eventId,
        eventServer: s?.serverId ?? m.channel?.serverId,
        title: s?.title ?? "",
        joins: Number(s?.joins ?? 0),
        minutes: Number(s?.minutes ?? 0),
      };
    },
    [selfId],
  );
  // web UserMention names everyone: load the people this line names who are not cached yet
  const missingKey = fields?.missing.join(",") ?? "";
  useEffect(() => {
    if (!missingKey) return;
    for (const id of missingKey.split(",")) if (!client.users.get(id)) void client.users.fetch(id).catch(() => undefined);
  }, [client, missingKey]);
  const openPinned = useCallback(() => {
    const target = fields?.messageId;
    if (!target || !fields) return;
    if (onJump) onJump(target);
    else router.push(anyChannelRoute({ id: fields.channelId }, target));
  }, [fields, onJump]);
  if (!fields) return null;
  const sid = serverId ?? fields.serverId;
  const bold = { fontFamily: fontFamily(i18n.locale, "bold") };

  let line: React.ReactNode = fields.content;
  let block: React.ReactNode = null;
  switch (fields.type) {
    case "user_added":
      // web: a bot gets its own sentence
      line = fields.userBot ? (
        <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> added the bot <SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /></Trans>
      ) : (
        <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> has been added by <SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /></Trans>
      );
      break;
    case "user_joined":
      line = <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> joined the server</Trans>;
      break;
    case "user_left":
      // web SystemMessage: "left the group" outside a server
      line = fields.server ? (
        <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> left the server</Trans>
      ) : (
        <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> left the group</Trans>
      );
      break;
    case "channel_renamed":
      line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> updated the group name to <Text style={bold}>{isolate(fields.name)}</Text></Trans>;
      break;
    case "channel_description_changed":
      line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> updated the group description</Trans>;
      break;
    case "channel_icon_changed":
      line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> updated the group icon{" "}</Trans>;
      break;
    case "message_pinned":
      line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> pinned <SysChannelLink message name={fields.channelName} voice={fields.channelVoice} onPress={openPinned} /></Trans>;
      break;
    case "message_unpinned":
      line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> unpinned <SysChannelLink message name={fields.channelName} voice={fields.channelVoice} onPress={openPinned} /></Trans>;
      break;
    case "user_kicked":
      line = <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> has been kicked from the server</Trans>;
      break;
    case "user_banned":
      line = <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> has been banned from the server</Trans>;
      break;
    case "user_remove":
      line = <Trans><SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> has been removed by <SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /></Trans>;
      break;
    case "channel_ownership_changed":
      line = <Trans><SysName v={fields.from} id={fields.fromId} avatar={fields.fromAvatar} serverId={sid} /> transferred group ownership to <SysName v={fields.to} id={fields.toId} avatar={fields.toAvatar} serverId={sid} /></Trans>;
      break;
    case "call_started": {
      // web SystemMessage: missed, unanswered, how long it lasted, or still going
      const call = fields.call;
      if (call?.kind === "unanswered") line = <Trans>Nobody answered your call</Trans>;
      else if (call?.kind === "missed") line = <Trans>Missed call from <SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /></Trans>;
      else if (call?.kind === "lasted") {
        // the sentence's last space becomes a no-break space: the duration
        // wraps together with "lasted", never alone
        line = (
          <>
            <Trans render={({ translation }) => <>{glueEnd(translation)}</>}><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> started a call that lasted </Trans>
            <SysDuration v={callDuration(call.ms, i18n.locale)} />
          </>
        );
      } else line = <Trans><SysName v={fields.by} id={fields.byId} avatar={fields.byAvatar} serverId={sid} /> started a call</Trans>;
      break;
    }
    case "automod_alert": {
      const flaggedId = fields.flaggedId;
      line = (
        <>
          <Trans>
            AutoMod flagged <SysName v={fields.user} id={fields.userId} avatar={fields.userAvatar} serverId={sid} /> in{" "}
            <SysChannelLink name={fields.flaggedName || "…"} voice={fields.flaggedVoice} onPress={() => flaggedId && router.push(anyChannelRoute({ id: flaggedId }))} /> ({fields.rule}):
          </Trans>{" "}
          <Text style={{ color: palette.fg2 }}>{`“${isolate(fields.content)}”`}</Text>
        </>
      );
      break;
    }
    case "event_started": {
      const eventId = fields.eventId;
      const eventServer = fields.eventServer;
      line = (
        <Trans>
          The event{" "}
          <Text style={{ color: palette.link }} accessibilityRole="link" onPress={eventId && eventServer ? () => openEvent(eventServer, eventId) : undefined}>
            {isolate(fields.title)}
          </Text>{" "}
          has started.
        </Trans>
      );
      break;
    }
    case "poll_ended":
      line = <PollEndedText question={fields.question} winners={fields.winners} votes={fields.votes} total={fields.total} />;
      break;
    case "raid_alert":
      block = <RaidAlert joins={fields.joins} minutes={fields.minutes} serverId={sid} />;
      break;
    case "text":
      // a server's welcome message: its mentions and channel links work (web: Markdown)
      block = (
        <View style={{ flex: 1 }}>
          <MessageContent content={fields.content} serverId={sid} />
        </View>
      );
      break;
  }
  const missed = fields.call?.kind === "missed" || fields.call?.kind === "unanswered";
  const mark = systemMark(fields.type, fields.server, missed);
  const tint = { accent: palette.accentText, danger: palette.danger, muted: palette.muted, warning: palette.warningText, live: palette.onlineText }[mark.tone];
  // web: the mark at the end of the avatar column, the line in message text
  return (
    <View
      testID={fields.type === "call_started" ? `call-line-${fields.call?.kind ?? "started"}` : `system-${fields.type}`}
      style={{ flexDirection: "row", alignItems: block ? "flex-start" : "center", minHeight: 28, paddingVertical: 4 }}
    >
      <View style={{ width: 48, height: lineFor(i18n.locale, LINE), alignItems: "center", justifyContent: "center" }}>
        <Icon name={mark.icon} size={16} color={tint} />
      </View>
      {block ?? (
        <AText size={SIZE} line={LINE} color={palette.fg} style={{ flex: 1 }}>
          {line}
        </AText>
      )}
    </View>
  );
}
