import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { fontFamily } from "@/theme/fonts";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";

import { inputDirStyle } from "../kit/bidi";
import { Icon } from "../Icon";
import { AText, FieldError } from "./parts";

/** Arabic-Indic and Persian digits become 0-9; anything else is dropped */
export function yearDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/\D/g, "")
    .slice(0, 4);
}

/**
 * Month and year of birth (web: BirthMonthField): a month list in the app's
 * language and a four-digit year, side by side (3 : 2).
 */
export function BirthMonthField({
  month,
  year,
  onMonth,
  onYear,
  error,
}: {
  month?: number;
  year: string;
  onMonth: (month: number) => void;
  onYear: (year: string) => void;
  error?: string;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const [yearFocused, setYearFocused] = useState(false);
  const months = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.locale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 15))));
  }, [i18n.locale]);

  const box = (active: boolean) => ({
    minHeight: 44,
    borderRadius: RADIUS,
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: error ? palette.danger : active ? palette.accent : palette.fieldBorder,
    outlineColor: active ? palette.accent : "transparent",
    outlineWidth: active ? 1 : 0,
    outlineStyle: "solid" as const,
  });

  return (
    <View style={{ gap: 8 }} accessibilityLabel={t`Month and year of birth`}>
      <AText size={12} line={16} weight="semibold" color={open || yearFocused ? palette.fg : palette.muted}>
        {t`Month and year of birth`}
      </AText>
      <View style={{ flexDirection: "row", gap: 8, zIndex: 10 }}>
        <View style={{ flex: 3 }}>
          <Pressable
            testID="birth-month"
            accessibilityRole="combobox"
            accessibilityLabel={`${t`Month of birth`} ${month ? months[month - 1] : ""}`}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={[box(open), { justifyContent: "center", paddingStart: 12, paddingEnd: 36 }]}
          >
            <AText size={16} line={20} color={month ? palette.fg : palette.muted} numberOfLines={1}>
              {month ? months[month - 1] : t`Month`}
            </AText>
            <View style={{ position: "absolute", end: 12, transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
              <Icon name="caret-down" size={16} color={palette.muted} />
            </View>
          </Pressable>
          {open ? (
            <View
              style={{
                position: "absolute",
                top: 48,
                start: 0,
                end: 0,
                maxHeight: 264,
                padding: 4,
                backgroundColor: palette.floating,
                borderWidth: 1,
                borderColor: palette.popoverBorder,
                borderRadius: RADIUS,
                shadowColor: palette.shadow,
                shadowOpacity: palette.dark ? 0.45 : 0.16,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {months.map((name, i) => {
                  const picked = month === i + 1;
                  return (
                    <Pressable
                      key={name}
                      testID={`birth-month-${i + 1}`}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: picked }}
                      onPress={() => {
                        onMonth(i + 1);
                        setOpen(false);
                      }}
                      style={({ pressed }) => ({
                        minHeight: 44,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: pressed ? palette.navHover : "transparent",
                      })}
                    >
                      <AText size={16} line={20} weight={picked ? "semibold" : "regular"} color={palette.fg}>
                        {name}
                      </AText>
                      {picked ? <Icon name="check-circle" size={16} color={palette.accentText} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 2 }}>
          {/* the field is the box itself: 44 px to the finger, not 42 inside a border */}
          <TextInput
            testID="birth-year"
            accessibilityLabel={t`Year of birth`}
            value={year}
            onChangeText={(v) => onYear(yearDigits(v))}
            onFocus={() => {
              setYearFocused(true);
              setOpen(false);
            }}
            onBlur={() => setYearFocused(false)}
            placeholder={t`Year`}
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="birthdate-year"
            maxLength={4}
            selectionColor={palette.accent}
            style={{
              ...box(yearFocused),
              paddingHorizontal: 12,
              fontSize: 16,
              lineHeight: 20,
              minHeight: 44,
              paddingVertical: 0,
              color: palette.fg,
              fontFamily: fontFamily(i18n.locale),
              fontVariant: ["tabular-nums"],
              // digits only: the placeholder at the language's start, the typed year left to right
              ...inputDirStyle(year, { latin: true }),
            }}
          />
        </View>
      </View>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <AText size={12} line={16} color={palette.muted}>
          {t`We keep only the month and year. They decide which content you can see.`}
        </AText>
      )}
    </View>
  );
}
