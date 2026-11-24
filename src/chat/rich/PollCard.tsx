import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { memo, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { intlLocale } from "@/chat/time";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { ConfirmDialog } from "@/ui/settings/parts";
import { Icon } from "@/ui/Icon";
import { AText, ParagraphText } from "@/ui/kit/Text";

import { BOX_RADIUS, RADIUS_SM, RText, withAlpha } from "./parts";
import { canEndPoll, isClosed, pollPercents, pollTotal, relativeParts, voteAction } from "./poll";
import { PollEmoji } from "./PollEmoji";
import { PollVotersSheet } from "./PollVotersSheet";

/** Whether the "End poll" menu entry shows for this message */
export function canEndThisPoll(message: Message, now = new Date()): boolean {
  const poll = message.poll;
  if (!poll) return false;
  return canEndPoll({
    author: message.author?.relationship === "User" || !!message.author?.self,
    manage: !!message.channel?.havePermission("ManageMessages"),
    closed: isClosed(poll, now),
  });
}

/** Ask before ending a poll early (web EndPoll); for the message menu's "End poll" */
export function EndPollDialog({ message, visible, onClose }: { message: Message; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  return (
    <ConfirmDialog
      visible={visible}
      title={t`End poll now?`}
      text={t`Voting stops for everyone and the results become final. This can't be undone.`}
      confirm={t`End poll`}
      danger={false}
      onConfirm={async () => {
        await message.endPoll();
      }}
      onClose={onClose}
    />
  );
}

/**
 * A poll in the message list (web PollCard): each answer a large row to
 * press, with a bar, the share and the count; your choice marked. Single
 * choice behaves as radio buttons, multiple choice as checkboxes. Counts
 * update live; the end time ticks every 30 s.
 */
export const PollCard = memo(function PollCard({ message, onLongPress }: { message: Message; onLongPress?: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const poll = useFields(message, (m) => m.poll);
  const canReact = useFields(message, (m) => !!m.channel?.havePermission("React"));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState<string>();
  const [voters, setVoters] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!poll) return null;
  const closed = isClosed(poll, new Date(now));
  const total = pollTotal(poll);
  const percents = pollPercents(poll);
  const canVote = !closed && !!canReact;
  const multiple = !!poll.allow_multiselect;

  const press = async (answer: number) => {
    if (!canVote || busy !== undefined) return;
    setBusy(answer);
    setError(undefined);
    try {
      if (voteAction(poll, answer) === "vote") await message.votePoll(answer);
      else await message.unvotePoll(answer);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(undefined);
    }
  };

  const votes = t`${plural(pollTotal(poll), { one: "# vote", other: "# votes" })}`;
  const rel = relativeParts(new Date(poll.expires_at).getTime() - now);
  const ends = new Intl.RelativeTimeFormat(intlLocale(i18n.locale), { numeric: "auto" }).format(rel.value, rel.unit);

  return (
    <View
      testID="poll-card"
      accessibilityLabel={poll.question}
      style={{ gap: 8, width: "100%", maxWidth: 480, marginVertical: 4, padding: 12, borderRadius: BOX_RADIUS, backgroundColor: palette.field }}
    >
      {/* people's words: each line reads and sits in its own direction (Arabic on the right in the English app) */}
      <ParagraphText size={15} line={22} weight="semibold" color={palette.fg} accessibilityRole="header">
        {poll.question}
      </ParagraphText>
      <RText size={12} line={16} color={palette.muted}>
        {multiple ? t`Choose one or more answers` : t`Choose one answer`}
      </RText>
      <View accessibilityRole={multiple ? undefined : "radiogroup"} style={{ gap: 8 }}>
        {poll.answers.map((answer, index) => {
          const mine = !!poll.me?.includes(answer.id);
          const share = percents[index] ?? 0;
          return (
            <Pressable
              key={answer.id}
              testID="poll-answer"
              accessibilityRole={multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: mine, disabled: !canVote, busy: busy === answer.id }}
              onPress={() => void press(answer.id)}
              onLongPress={onLongPress}
              delayLongPress={300}
              style={({ pressed }) => ({
                overflow: "hidden",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: RADIUS_SM,
                borderWidth: 1,
                borderColor: mine ? palette.accent : palette.borderSubtle,
                backgroundColor: pressed && canVote ? palette.navHover : palette.field,
                opacity: busy === answer.id ? 0.7 : 1,
              })}
            >
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  start: 0,
                  width: `${share}%`,
                  backgroundColor: mine ? withAlpha(palette.accent, 0.18) : palette.navHover,
                }}
              />
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: multiple ? 4 : 10,
                  borderWidth: 2,
                  borderColor: mine ? palette.accent : palette.borderStrong,
                  backgroundColor: mine ? palette.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mine ? <Icon name="check" size={14} color={palette.onAccent} /> : null}
              </View>
              {answer.emoji ? <PollEmoji emoji={answer.emoji} /> : null}
              <AText autoDir size={14} line={20} color={palette.fg} style={{ flex: 1, minWidth: 0 }}>
                {answer.text}
              </AText>
              <View style={{ alignItems: "flex-end" }}>
                <RText size={13} line={18} weight="semibold" color={palette.fg} style={{ fontVariant: ["tabular-nums"] }}>
                  {`${share}%`}
                </RText>
                <RText size={12} line={16} color={palette.muted}>
                  {t`${plural(answer.count ?? 0, { one: "# vote", other: "# votes" })}`}
                </RText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <RText testID="poll-status" size={12} line={16} color={palette.muted}>
          {closed ? `${votes} · ${t`Final results`}` : `${votes} · ${t`Ends ${String(ends)}`}`}
        </RText>
        {total > 0 ? (
          <Pressable
            testID="poll-voters"
            accessibilityRole="button"
            onPress={() => setVoters(true)}
            style={{ minHeight: 44, paddingHorizontal: 4, justifyContent: "center" }}
          >
            <RText size={12} line={16} weight="semibold" color={palette.accentText}>
              {t`See who voted`}
            </RText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <RText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {error}
        </RText>
      ) : null}
      {voters ? <PollVotersSheet message={message} visible={voters} onClose={() => setVoters(false)} /> : null}
    </View>
  );
});
