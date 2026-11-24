/**
 * A day and a time in the person's own time zone and language (web:
 * design/DateTimeField): the label, a day field and a time field on one
 * line, and the time zone named under them. The phone's own pickers do the
 * choosing: on iPhone a calendar or a time wheel opens inline under the
 * fields (as in the Calendar app), on Android the system dialog opens.
 * Days before `min` cannot be picked (web: `min`).
 */
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { buzz } from "@/ui/kit/haptics";

import { fieldTexts, onDayAt, zoneText } from "./eventFormat";

/** The time step of the web's time list (web: TIME_STEP, quarter hours) */
const TIME_STEP = 15;

/** Whether the language writes times on a 24 hour clock */
const uses24h = (locale: string) => new Intl.DateTimeFormat(locale || "en", { numberingSystem: "latn", hour: "numeric" }).format(new Date(2000, 0, 3, 13)).includes("13");

function FieldButton({ icon, text, label, open, onPress, testID, flex }: { icon: IconName; text: string; label: string; open: boolean; onPress: () => void; testID: string; flex?: number }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text }}
      accessibilityState={{ expanded: Platform.OS === "ios" ? open : undefined }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex,
        minHeight: 44,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: open ? palette.accent : palette.fieldBorder,
        backgroundColor: pressed ? palette.navHover : palette.field,
      })}
    >
      <Icon name={icon} size={18} color={open ? palette.accentText : palette.iconNeutral} />
      <AText size={16} line={20} color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </AText>
    </Pressable>
  );
}

export function DateTimeField({ label, value, min, onChange, testID }: { label: string; value: Date; min?: Date; onChange: (d: Date) => void; testID: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState<"day" | "time">();
  const ios = Platform.OS === "ios";
  const texts = fieldTexts(value, i18n.locale);
  const zone = zoneText(value, i18n.locale);

  const pickDay = () => {
    if (ios) {
      buzz("selection");
      setOpen((o) => (o === "day" ? undefined : "day"));
      return;
    }
    DateTimePickerAndroid.open({
      value,
      mode: "date",
      minimumDate: min,
      onValueChange: (_e, date) => onChange(onDayAt(date, value)),
    });
  };
  const pickTime = () => {
    if (ios) {
      buzz("selection");
      setOpen((o) => (o === "time" ? undefined : "time"));
      return;
    }
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      is24Hour: uses24h(i18n.locale),
      onValueChange: (_e, date) => onChange(onDayAt(value, date)),
    });
  };

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <AText size={13} line={20} weight="semibold" color={open ? palette.fg : palette.fg2}>
        {label}
      </AText>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <FieldButton testID={`${testID}-date`} icon="calendar" text={texts.day} label={label} open={open === "day"} onPress={pickDay} flex={1} />
        <FieldButton testID={`${testID}-time`} icon="clock" text={texts.time} label={`${label}: ${t`Time`}`} open={open === "time"} onPress={pickTime} />
      </View>
      {ios && open ? (
        <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden", alignItems: "center" }}>
          <DateTimePicker
            testID={`${testID}-${open}-picker`}
            value={value}
            mode={open === "day" ? "date" : "time"}
            display={open === "day" ? "inline" : "spinner"}
            minimumDate={open === "day" ? min : undefined}
            minuteInterval={open === "time" ? TIME_STEP : undefined}
            locale={i18n.locale}
            accentColor={palette.accent}
            textColor={palette.fg}
            themeVariant={palette.dark ? "dark" : "light"}
            onValueChange={(_e, date) => {
              if (open === "day") {
                onChange(onDayAt(date, value));
                // a day was chosen: the calendar closes, as the web's does
                setOpen(undefined);
              } else onChange(onDayAt(value, date));
            }}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      ) : null}
      <View testID={`${testID}-zone`} accessible accessibilityLabel={`${t`Time zone`}: ${zone}`} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="globe" size={14} color={palette.muted} />
        <AText size={12} line={16} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {zone}
        </AText>
      </View>
    </View>
  );
}
