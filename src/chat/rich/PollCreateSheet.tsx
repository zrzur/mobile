import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { TextField } from "@/ui/auth/parts";
import { AText, Button, inputDirStyle, ParagraphText } from "@/ui/kit";
import { Choices, Toggle } from "@/ui/settings/parts";
import { Icon } from "@/ui/Icon";

import { BOX_RADIUS, RADIUS_SM, RText, RichSheet, SheetButton } from "./parts";
import {
  ANSWERS_MAX,
  ANSWER_MAX,
  type DraftAnswer,
  POLL_DURATIONS,
  QUESTION_MAX,
  draftProblem,
  moveItem,
  removeAnswer,
  toDataPoll,
} from "./poll";
import { PollEmoji } from "./PollEmoji";

/** A few emoji to give an answer, picked inline (one sheet at a time) */
const QUICK_EMOJI = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅", "❌", "⭐", "💡", "🍕", "☕", "🎮", "🎵", "⚽", "🏆", "🐱", "🐶", "🌙", "☀️", "🌈", "🤔"];

const newRow = (): DraftAnswer => ({ key: randomUUID(), text: "" });


/**
 * Write a poll (web CreatePoll): a question, two to ten answers (each with
 * an optional emoji, movable), how long it stays open, whether several
 * answers may be picked, and a preview. Sends itself; one key per sheet so
 * a double press or a retry sends once.
 */
export function PollCreateSheet({
  channel,
  visible,
  onClose,
  onPosted,
}: {
  channel: Channel;
  visible: boolean;
  onClose: () => void;
  /** after the poll was sent */
  onPosted?: () => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<DraftAnswer[]>(() => [newRow(), newRow()]);
  const [duration, setDuration] = useState<number>(24);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [tried, setTried] = useState(false);
  const [emojiFor, setEmojiFor] = useState<string>();
  const [menuFor, setMenuFor] = useState<string>();
  const [choosing, setChoosing] = useState(false);
  const [focusKey, setFocusKey] = useState<string>();
  const key = useRef(randomUUID());

  const problem = draftProblem(question, answers);
  const dirty = !!question || answers.some((a) => a.text);

  const durationLabel = (hours: number) => {
    switch (hours) {
      case 1:
        return t`1 hour`;
      case 4:
        return t`4 hours`;
      case 8:
        return t`8 hours`;
      case 24:
        return t`24 hours`;
      case 72:
        return t`3 days`;
      case 168:
        return t`1 week`;
      default:
        return t`2 weeks`;
    }
  };

  const problemText =
    problem === "question"
      ? t`Write a question.`
      : problem === "answers"
        ? t`Add at least two answers.`
        : problem === "answer"
          ? t`An answer can be at most ${ANSWER_MAX} characters.`
          : undefined;

  const update = (rowKey: string, change: Partial<DraftAnswer>) => setAnswers((list) => list.map((a) => (a.key === rowKey ? { ...a, ...change } : a)));

  const addAnswer = () => {
    if (answers.length >= ANSWERS_MAX) return;
    const row = newRow();
    setAnswers((list) => [...list, row]);
    setFocusKey(row.key);
  };

  const close = () => {
    if (sending) return;
    onClose();
  };

  const send = async () => {
    setTried(true);
    if (problem || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await channel.sendMessage({ poll: toDataPoll(question, answers, duration, multiple) }, key.current);
      onPosted?.();
      onClose();
      setQuestion("");
      setAnswers([newRow(), newRow()]);
      setTried(false);
      key.current = randomUUID();
    } catch (err) {
      setError(describeError(err));
      key.current = randomUUID();
    } finally {
      setSending(false);
    }
  };

  const filled = answers.filter((a) => a.text.trim());
  const banner = error ?? (tried ? problemText : undefined);

  return (
    <RichSheet visible={visible} onClose={close} dismissable={!dirty && !sending} testID="create-poll">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingBottom: 4 }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="list-checks" size={22} color={palette.accentText} />
            <RText size={18} line={26} weight="bold" color={palette.header}>
              {t`Create poll`}
            </RText>
          </View>
          <RText size={14} line={20} color={palette.fg2}>
            {t`Ask a question and let people vote. Results update live.`}
          </RText>
        </View>

        <View>
          <TextField
            testID="poll-question"
            label={t`Question`}
            placeholder={t`What do you want to ask?`}
            maxLength={QUESTION_MAX}
            value={question}
            onChangeText={setQuestion}
            autoFocus
            multiline
          />
          <RText size={12} line={16} color={palette.muted} style={{ alignSelf: "flex-end", marginTop: 4 }}>
            {`${[...question].length}/${QUESTION_MAX}`}
          </RText>
        </View>

        <View accessibilityRole="none" accessibilityLabel={t`Answers`} style={{ gap: 8 }}>
          <RText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Answers`}
          </RText>
          {answers.map((answer, index) => (
            <View key={answer.key} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t`Emoji for answer ${index + 1}`}
                  accessibilityState={{ expanded: emojiFor === answer.key }}
                  onPress={() => {
                    setMenuFor(undefined);
                    setEmojiFor(emojiFor === answer.key ? undefined : answer.key);
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: RADIUS_SM,
                    borderWidth: 1,
                    borderColor: emojiFor === answer.key ? palette.accent : palette.borderSubtle,
                    backgroundColor: palette.field,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {answer.emoji ? <PollEmoji emoji={answer.emoji} /> : <Icon name="smiley" size={20} color={palette.fg2} />}
                </Pressable>
                <TextInput
                  ref={(input) => {
                    if (input && focusKey === answer.key) {
                      input.focus();
                      setFocusKey(undefined);
                    }
                  }}
                  value={answer.text}
                  maxLength={ANSWER_MAX}
                  placeholder={t`Answer ${index + 1}`}
                  accessibilityLabel={t`Answer ${index + 1}`}
                  placeholderTextColor={palette.muted}
                  selectionColor={palette.accent}
                  onChangeText={(text) => update(answer.key, { text })}
                  returnKeyType={index === answers.length - 1 && answers.length < ANSWERS_MAX ? "next" : "done"}
                  submitBehavior={index === answers.length - 1 ? "submit" : "blurAndSubmit"}
                  onSubmitEditing={() => index === answers.length - 1 && addAnswer()}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: palette.fieldBorder,
                    backgroundColor: palette.field,
                    color: palette.fg,
                    fontSize: 16,
                    fontFamily: fontFamily(i18n.locale),
                    ...inputDirStyle(answer.text),
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t`Options for answer ${index + 1}`}
                  accessibilityState={{ expanded: menuFor === answer.key }}
                  onPress={() => {
                    setEmojiFor(undefined);
                    setMenuFor(menuFor === answer.key ? undefined : answer.key);
                  }}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: RADIUS_SM,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed || menuFor === answer.key ? palette.navSelected : "transparent",
                  })}
                >
                  <Icon name="dots-three-vertical" size={20} color={palette.iconMuted} />
                </Pressable>
              </View>

              {menuFor === answer.key ? (
                <View accessibilityRole="menu" style={{ borderRadius: BOX_RADIUS, backgroundColor: palette.field, overflow: "hidden" }}>
                  {[
                    index > 0 ? { icon: "caret-up" as const, label: t`Move up`, act: () => setAnswers((l) => moveItem(l, index, index - 1)) } : null,
                    index < answers.length - 1 ? { icon: "caret-down" as const, label: t`Move down`, act: () => setAnswers((l) => moveItem(l, index, index + 1)) } : null,
                    { icon: "x" as const, label: t`Remove`, act: () => setAnswers((l) => removeAnswer(l, index)) },
                  ]
                    .filter((item) => item !== null)
                    .map((item, i) => (
                      <Pressable
                        key={item.label}
                        accessibilityRole="menuitem"
                        onPress={() => {
                          setMenuFor(undefined);
                          item.act();
                        }}
                        style={({ pressed }) => ({
                          minHeight: 48,
                          paddingHorizontal: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          borderTopWidth: i ? 1 : 0,
                          borderTopColor: palette.divider,
                          backgroundColor: pressed ? palette.navSelected : "transparent",
                        })}
                      >
                        <Icon name={item.icon} size={20} color={palette.iconNeutral} />
                        <RText size={15} line={20} weight="medium" color={palette.fg}>
                          {item.label}
                        </RText>
                      </Pressable>
                    ))}
                </View>
              ) : null}

              {emojiFor === answer.key ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 8, borderRadius: BOX_RADIUS, backgroundColor: palette.field }}>
                  {QUICK_EMOJI.map((emoji) => (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityLabel={emoji}
                      accessibilityState={{ selected: answer.emoji === emoji }}
                      onPress={() => {
                        update(answer.key, { emoji: answer.emoji === emoji ? undefined : emoji });
                        setEmojiFor(undefined);
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: RADIUS_SM,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: answer.emoji === emoji ? palette.navSelected : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 24, lineHeight: 30 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {answers.length < ANSWERS_MAX ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button testID="poll-add-answer" variant="tonal" icon="plus" label={t`Add answer`} onPress={addAnswer} />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <RText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Open for`}
          </RText>
          <Pressable
            testID="poll-duration"
            accessibilityRole="button"
            accessibilityLabel={`${t`Open for`}: ${durationLabel(duration)}`}
            accessibilityState={{ expanded: choosing }}
            onPress={() => setChoosing(!choosing)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: choosing ? palette.accent : palette.fieldBorder,
              backgroundColor: palette.field,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <RText size={16} line={20} color={palette.fg}>
              {durationLabel(duration)}
            </RText>
            <Icon name={choosing ? "caret-up" : "caret-down"} size={16} color={palette.muted} />
          </Pressable>
          {choosing ? (
            <Choices
              value={String(duration)}
              options={POLL_DURATIONS.map((hours) => ({ value: String(hours), title: durationLabel(hours) }))}
              onChange={(value) => {
                setDuration(Number(value));
                setChoosing(false);
              }}
            />
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <RText size={14} line={20} color={palette.fg}>
              {t`Allow more than one answer`}
            </RText>
            <RText size={12} line={16} color={palette.muted}>
              {t`People can pick several answers.`}
            </RText>
          </View>
          <Toggle value={multiple} onChange={setMultiple} label={t`Allow more than one answer`} testID="poll-multiple" />
        </View>

        <View testID="poll-preview" accessibilityLabel={t`Preview`} style={{ gap: 8, padding: 12, borderRadius: BOX_RADIUS, backgroundColor: palette.field }}>
          <RText size={12} line={16} weight="semibold" color={palette.muted}>
            {t`Preview`}
          </RText>
          <ParagraphText size={15} line={22} weight="semibold" color={palette.fg}>
            {question.trim() || t`Your question`}
          </ParagraphText>
          <RText size={12} line={16} color={palette.muted}>
            {multiple ? t`Choose one or more answers` : t`Choose one answer`}
          </RText>
          {filled.map((answer) => (
            <View
              key={answer.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: RADIUS_SM,
                borderWidth: 1,
                borderColor: palette.borderSubtle,
                backgroundColor: palette.frame,
              }}
            >
              <View style={{ width: 16, height: 16, borderRadius: multiple ? 4 : 8, borderWidth: 2, borderColor: palette.borderStrong }} />
              {answer.emoji ? <PollEmoji emoji={answer.emoji} /> : null}
              <AText autoDir size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                {answer.text}
              </AText>
            </View>
          ))}
          <RText size={12} line={16} color={palette.muted}>
            {t`Open for ${durationLabel(duration)}`}
          </RText>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        {banner ? (
          <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: BOX_RADIUS, backgroundColor: palette.field }}>
            <Icon name="warning-circle" size={16} color={palette.danger} />
            <RText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
              {banner}
            </RText>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SheetButton label={t`Cancel`} onPress={close} disabled={sending} />
          <SheetButton testID="poll-post" label={t`Post poll`} primary onPress={() => void send()} disabled={sending} />
        </View>
      </View>
    </RichSheet>
  );
}
