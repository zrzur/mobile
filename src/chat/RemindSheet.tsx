import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { useState } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { DateTimeField } from "@/ui/events/DateTimeField";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { PressableRow } from "@/ui/kit/Press";
import { SheetModal } from "@/ui/kit/Sheet";
import { AText } from "@/ui/kit/Text";
import { describeError } from "@/auth/errorText";

import { createReminder, dueProblem, moveReminder, presetTimes, type Reminder, type ReminderPreset, suggestedCustomTime } from "./keep";
import { clock, dateLocale, messageTime } from "./time";

/**
 * "Remind me" on a message (web: modals/RemindMessage): four ready-made
 * times, each sets the reminder at once, and "Pick a time" opens the
 * phone's own date and time pickers. Times are on the phone's own clock.
 * With `reminder` it is "Change the time" for a waiting reminder.
 *
 * Remind me
 * | words of the message…
 * [ In 20 minutes              14:30 ]
 * [ In 1 hour                  15:10 ]
 * [ Tonight                    20:00 ]
 * [ Tomorrow morning       Fri 09:00 ]
 * [ Pick a time                    v ]
 *   (day) (time)  zone
 * [ Set reminder ] [ Cancel ]
 */
export function RemindSheet({
  message,
  reminder,
  onClose,
  onToast,
}: {
  message: Message;
  reminder?: Reminder;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  // the times are worked out once, when the sheet opens
  const [now] = useState(() => new Date());
  const [presets] = useState(() => presetTimes(now));
  const [custom, setCustom] = useState(!!reminder);
  const [at, setAt] = useState(() => (reminder ? new Date(reminder.due_at) : suggestedCustomTime(now)));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const names: Record<ReminderPreset, string> = {
    "20m": t`In 20 minutes`,
    "1h": t`In 1 hour`,
    tonight: t`Tonight`,
    morning: t`Tomorrow morning`,
  };
  /** the hour for today's times, the day as well for another day's */
  const shown = (time: Date) =>
    time.toDateString() === now.toDateString()
      ? clock(time, i18n.locale)
      : `${new Intl.DateTimeFormat(dateLocale(i18n.locale), { weekday: "short" }).format(time)} ${clock(time, i18n.locale)}`;

  const set = async (time: Date) => {
    if (busy) return;
    const wrong = dueProblem(time, new Date());
    if (wrong) {
      haptics.error();
      setProblem(wrong === "past" ? t`Pick a time that is still ahead.` : t`Pick a time within the next year.`);
      return;
    }
    setProblem(undefined);
    setBusy(true);
    try {
      if (reminder) await moveReminder(client, reminder._id, time);
      else await createReminder(client, message.id, time);
      haptics.success();
      onToast(t`Reminder set for ${messageTime(i18n, time)}.`);
      onClose();
    } catch (err) {
      haptics.error();
      setProblem(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const words = client.markdownToText(message.content ?? "").slice(0, 140);

  const choice = (key: string, title: string, end: React.ReactNode, onPress: () => void, extra?: object) => (
    <PressableRow
      key={key}
      testID={`remind-${key}`}
      accessibilityRole="button"
      disabled={busy}
      highlight={palette.navSelected}
      onPress={onPress}
      {...extra}
      style={{
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: key === "20m" ? 0 : 1,
        borderTopColor: palette.divider,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <AText size={16} line={22} weight="medium" color={palette.fg} style={{ flex: 1 }}>
        {title}
      </AText>
      {end}
    </PressableRow>
  );

  return (
    <SheetModal visible onClose={onClose} testID="remind-dialog" dismissible={!busy} panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="clock" size={22} color={palette.iconNeutral} />
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {reminder ? t`Change the time` : t`Remind me`}
        </AText>
      </View>
      {words ? (
        <View style={{ borderStartWidth: 2, borderStartColor: palette.borderStrong, paddingStart: 12 }}>
          <AText autoDir size={14} line={20} color={palette.fg2} numberOfLines={2}>
            {words}
          </AText>
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={t`When`} style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
        {presets.map((p) =>
          choice(
            p.preset,
            p.preset === "morning" && p.sameDay ? t`This morning` : names[p.preset],
            <AText size={13} line={18} color={palette.muted}>
              {shown(p.at)}
            </AText>,
            () => void set(p.at),
          ),
        )}
        {choice(
          "custom",
          t`Pick a time`,
          <Icon name={custom ? "caret-up" : "caret-down"} size={16} color={palette.muted} />,
          () => {
            haptics.selection();
            setCustom((v) => !v);
          },
          { accessibilityState: { expanded: custom } },
        )}
      </View>
      {custom ? (
        <DateTimeField
          label={t`Remind me at`}
          value={at}
          min={now}
          testID="remind-custom"
          onChange={(value) => {
            setAt(value);
            setProblem(undefined);
          }}
        />
      ) : null}
      {problem ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
          <Icon name="warning-circle" size={16} color={palette.danger} />
          <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
            {problem}
          </AText>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        {custom ? (
          <Button testID="remind-set" label={reminder ? t`Save` : t`Set reminder`} onPress={() => void set(at)} status={busy ? "submitting" : "ready"} fill />
        ) : null}
        <Button label={t`Cancel`} onPress={onClose} variant="tonal" fill disabled={busy} />
      </View>
    </SheetModal>
  );
}
