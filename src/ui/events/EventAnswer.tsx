import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { answerAction, seatState } from "./eventFormat";
import { setAnswer, useRsvp, withdrawAnswer } from "./eventsStore";
import type { EventAnswerValue, ServerEvent } from "./types";

/** The seats as a bar; nothing for an event without a limit (web: SeatBar) */
export function SeatBar({ event }: { event: ServerEvent }) {
  const { palette } = useTheme();
  const seats = seatState(event);
  if (seats.capacity === undefined) return null;
  return (
    <View testID="event-seat-bar" accessible={false} style={{ height: 6, borderRadius: 999, backgroundColor: palette.tonal, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.round(seats.share * 100)}%`, borderRadius: 999, backgroundColor: seats.full ? palette.idle : palette.online }} />
    </View>
  );
}

/**
 * "Will you come?": going, maybe, can't go. With a seat limit, going takes
 * a seat or a place on the waiting list. Pressing your answer again takes
 * it back (web: EventAnswer).
 */
export function EventAnswer({ event, serverId }: { event: ServerEvent; serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const mine = useRsvp(event._id);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState<EventAnswerValue>();
  const seats = seatState(event);
  const seated = mine?.answer === "Going" && !mine?.waiting;
  const waiting = mine?.answer === "Going" && !!mine?.waiting;
  const noSeat = seats.full && !seated && !event.over_capacity;
  const canWait = event.waitlist !== false;

  async function answer(next: EventAnswerValue) {
    if (sending) return;
    setSending(next);
    setError(undefined);
    try {
      if (answerAction(mine?.answer, next) === "withdraw") await withdrawAnswer(client, serverId, event._id);
      else await setAnswer(client, serverId, event._id, next);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(undefined);
    }
  }

  const question = waiting && mine?.position ? t`You are number ${mine.position} on the waiting list` : waiting ? t`You are on the waiting list` : noSeat ? t`All seats are taken` : t`Will you come?`;
  const line =
    seated && seats.capacity !== undefined
      ? t`You have a seat. Change your answer any time.`
      : waiting
        ? t`The seat becomes yours by itself when one is free.`
        : noSeat && canWait
          ? t`${plural(seats.waiting, { 0: "Nobody is waiting yet. Seats go to whoever came first.", one: "# person is waiting before you. Seats go to whoever came first.", other: "# people are waiting before you. Seats go to whoever came first." })}`
          : noSeat
            ? t`This event has no waiting list.`
            : seats.capacity !== undefined && !mine
              ? t`${seats.left ?? 0} of ${seats.capacity} seats are free.`
              : mine
                ? t`Change your answer any time.`
                : "";

  const goingLabel = waiting ? t`On the waiting list` : noSeat && canWait ? t`Join the waiting list` : t({ message: "Going", context: "event answer" });
  const choices: { value: EventAnswerValue; label: string; disabled?: boolean; testID: string }[] = [
    { value: "Going", label: goingLabel, disabled: noSeat && !waiting && !canWait, testID: "event-answer-going" },
    { value: "Maybe", label: t({ message: "Maybe", context: "event answer" }), testID: "event-answer-maybe" },
    { value: "NotGoing", label: t({ message: "Can't go", context: "event answer" }), testID: "event-answer-not-going" },
  ];

  return (
    <View testID="event-answer" style={{ gap: 12 }}>
      <AText size={15} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
        {question}
      </AText>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {choices.map((c) => {
          const on = mine?.answer === c.value;
          return (
            <Pressable
              key={c.value}
              testID={c.testID}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: c.disabled, busy: sending === c.value }}
              disabled={c.disabled}
              onPress={() => void answer(c.value)}
              style={({ pressed }) => ({
                minHeight: 44,
                borderRadius: 10,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: c.disabled ? 0.5 : 1,
                backgroundColor: on ? (pressed ? palette.accentPressed : palette.accent) : pressed ? palette.tonalHover : palette.tonal,
              })}
            >
              {sending === c.value ? <ActivityIndicator size="small" color={on ? palette.onAccent : palette.fg} /> : c.value === "Going" && seated ? <Icon name="check" size={16} color={palette.onAccent} /> : null}
              <AText size={14} line={20} weight="semibold" color={on ? palette.onAccent : palette.fg}>
                {c.label}
              </AText>
            </Pressable>
          );
        })}
      </View>
      {line ? (
        <AText size={13} line={20} color={seated ? palette.onlineText : waiting ? palette.warningText : palette.fg2}>
          {line}
        </AText>
      ) : null}
      {error ? (
        <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
          <AText size={13} line={18} color={palette.fg}>
            {error}
          </AText>
        </View>
      ) : null}
    </View>
  );
}
