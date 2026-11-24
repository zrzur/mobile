import { useLingui } from "@lingui/react/macro";
import type { Message, User } from "@zrzur/sdk/solid";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { autoDirStyle } from "@/ui/kit/bidi";
import { AText, ParagraphText } from "@/ui/kit/Text";

import { RText, RichSheet, SheetButton, withAlpha } from "./parts";
import { firstVotedAnswer } from "./poll";
import { PollEmoji } from "./PollEmoji";

type Page = { users: User[]; next?: string };

/**
 * Who chose each answer (web PollVoters): one answer at a time (chips),
 * oldest vote first, more on request
 */
export function PollVotersSheet({ message, visible, onClose }: { message: Message; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const poll = message.poll;
  const [answer, setAnswer] = useState(() => (poll ? firstVotedAnswer(poll) : undefined));
  const [page, setPage] = useState<Page>({ users: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  const load = (id: number, after?: string) => {
    const request = ++latest.current;
    setLoading(true);
    setError(undefined);
    message
      .fetchPollVoters(id, { limit: 50, after })
      .then((result) => {
        if (request !== latest.current) return;
        setPage((current) => ({ users: after ? [...current.users, ...result.users] : result.users, next: result.next }));
      })
      .catch((err) => request === latest.current && setError(describeError(err)))
      .finally(() => request === latest.current && setLoading(false));
  };

  // a newly chosen answer (or the sheet opening) starts from the first page
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (visible && answer !== undefined) loadRef.current(answer);
  }, [visible, answer]);

  if (!poll) return null;
  const name = (user: User) => message.server?.getMember(user.id)?.nickname ?? user.displayName;

  return (
    <RichSheet visible={visible} onClose={onClose} testID="poll-voters-dialog">
      <View style={{ paddingHorizontal: 16, gap: 12, flexShrink: 1 }}>
        <View style={{ gap: 4 }}>
          <RText size={18} line={26} weight="bold" color={palette.header}>
            {t`Votes`}
          </RText>
          <ParagraphText size={14} line={20} color={palette.fg2}>
            {poll.question}
          </ParagraphText>
        </View>
        <View accessibilityRole="tablist" accessibilityLabel={t`Answers`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {poll.answers.map((item) => {
            const on = item.id === answer;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (on) return;
                  setPage({ users: [] });
                  setAnswer(item.id);
                }}
                style={{
                  minHeight: 44,
                  maxWidth: "100%",
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? palette.accent : palette.borderSubtle,
                  backgroundColor: on ? withAlpha(palette.accent, 0.16) : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {item.emoji ? <PollEmoji emoji={item.emoji} size={16} /> : null}
                <AText autoDir size={13} line={18} color={palette.fg} numberOfLines={1} style={{ maxWidth: 200 }}>
                  {item.text}
                </AText>
                <RText size={13} line={18} color={palette.muted}>
                  {String(item.count ?? 0)}
                </RText>
              </Pressable>
            );
          })}
        </View>
        <ScrollView
          accessibilityRole="list"
          style={{ maxHeight: 360, borderRadius: 10, borderWidth: 1, borderColor: palette.borderSubtle }}
          contentContainerStyle={{ padding: 12, gap: 4 }}
        >
          {page.users.length === 0 && !loading ? (
            <RText size={14} line={20} color={palette.muted}>
              {t`Nobody chose this answer yet.`}
            </RText>
          ) : null}
          {page.users.map((user) => (
            <View key={user.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
              <Avatar url={user.animatedAvatarURL} name={name(user)} size={32} />
              <RText size={14} line={20} color={palette.fg} numberOfLines={1} style={[{ flex: 1 }, autoDirStyle(name(user))]}>
                {name(user)}
              </RText>
            </View>
          ))}
          {loading ? <ActivityIndicator color={palette.muted} /> : null}
        </ScrollView>
        {page.next ? (
          <View style={{ flexDirection: "row" }}>
            <SheetButton label={t`Show more`} disabled={loading} onPress={() => answer !== undefined && load(answer, page.next)} />
          </View>
        ) : null}
        {error ? (
          <RText size={13} line={18} color={palette.danger} accessibilityRole="alert">
            {error}
          </RText>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <SheetButton label={t`Close`} onPress={onClose} />
        </View>
      </View>
    </RichSheet>
  );
}
