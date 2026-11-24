import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { changeLocale } from "@/i18n/i18n";
import { LOCALES, LOCALE_NAMES, type Locale, isLocale } from "@/i18n/locale";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { RowGroup, SearchField } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { ControlRow, SettingsPage, SettingsSection } from "../parts";
import { PickerSheet } from "../server/controls";
import { useDevicePrefs } from "./devicePrefs";
import { NavRow } from "./userParts";
import { DATETIME_DEFAULTS, DATETIME_KEY, DATE_FORMATS, TIME_FORMATS, formatPattern } from "./userPrefs";
import { openExternal } from "@/ui/kit/openLink";

/** The language's name in the app language ("Arabisch"), when the device knows it */
function localName(code: string, inLocale: string): string {
  try {
    const names = new Intl.DisplayNames([inLocale === "zh-Hans" ? "zh-CN" : inLocale], { type: "language" });
    return names.of(code) ?? "";
  } catch {
    return "";
  }
}

/** A sample date: 31 December this year, 18:30 (fixed so it shows day/month order) */
const SAMPLE = new Date(2026, 11, 31, 18, 30);

/**
 * Language (web: Language page) over the seven languages the app ships.
 * Choosing one reuses the app's changeLocale (reloads once for RTL).
 * Date and time formats are kept on this device, like the web locale store.
 */
export function LanguagePage() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const current: Locale = isLocale(i18n.locale) ? i18n.locale : "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Locale | null>(null);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [formats, setFormats] = useDevicePrefs(DATETIME_KEY, DATETIME_DEFAULTS);

  const shown = useMemo(() => {
    const q = foldSearch(query.trim());
    if (!q) return [...LOCALES];
    return LOCALES.filter((l) => [LOCALE_NAMES[l].name, LOCALE_NAMES[l].code, localName(l, i18n.locale)].some((s) => foldSearch(s).includes(q)));
  }, [query, i18n.locale]);

  const choose = (locale: Locale) => {
    if (busy || locale === current) return;
    setBusy(locale);
    changeLocale(locale).finally(() => setBusy(null));
  };

  const dateLabel = (f: string) => {
    const sample = formatPattern(f, SAMPLE);
    return f === "DD/MM/YYYY" ? t`${sample} · Day first` : f === "MM/DD/YYYY" ? t`${sample} · Month first` : t`${sample} · ISO 8601`;
  };
  const timeLabel = (f: string) => {
    const sample = formatPattern(f, SAMPLE);
    return f === "HH:mm" ? t`${sample} · 24-hour` : t`${sample} · 12-hour`;
  };

  const badge = (locale: Locale) => (
    <View style={{ minWidth: 36, height: 24, paddingHorizontal: 8, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: palette.pill }}>
      <AText size={12} line={16} weight="semibold" color={palette.fg2}>
        {LOCALE_NAMES[locale].code}
      </AText>
    </View>
  );

  return (
    <SettingsPage title={t`Language`} testID="user-language">
      <SettingsSection title={t`Language`} description={t`Untranslated text falls back to English.`}>
        <RowGroup>
          <Pressable
            testID="language-trigger"
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? palette.navSelected : "transparent" })}
          >
            {badge(current)}
            <View style={{ flex: 1 }}>
              <AText size={14} line={20} weight="medium" color={palette.fg}>
                {LOCALE_NAMES[current].name}
              </AText>
              {localName(current, i18n.locale) && localName(current, i18n.locale) !== LOCALE_NAMES[current].name ? (
                <AText size={13} line={18} color={palette.muted}>
                  {localName(current, i18n.locale)}
                </AText>
              ) : null}
            </View>
            <AText size={14} line={20} weight="semibold" color={palette.accentText}>
              {open ? t`Close` : t`Change`}
            </AText>
          </Pressable>
          {open ? (
            <View style={{ borderTopWidth: 1, borderTopColor: palette.divider, padding: 12, gap: 12 }}>
              <View style={{ flexDirection: "row", height: 44 }}>
                <SearchField value={query} onChange={setQuery} placeholder={t`Search languages`} testID="language-search" />
              </View>
              {shown.length === 0 ? (
                <AText size={14} line={20} color={palette.muted}>
                  {t`No language matches “${query}”.`}
                </AText>
              ) : (
                <View style={{ gap: 8 }}>
                  <AText size={13} line={18} weight="semibold" color={palette.muted}>
                    {t`Fully translated`}
                  </AText>
                  <View accessibilityRole="radiogroup" accessibilityLabel={t`Language`}>
                    {shown.map((locale) => {
                      const on = locale === current;
                      const other = localName(locale, i18n.locale);
                      return (
                        <Pressable
                          key={locale}
                          testID={`language-${locale}`}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on, busy: busy === locale }}
                          aria-checked={on}
                          disabled={!!busy}
                          onPress={() => choose(locale)}
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 8, borderRadius: 10, backgroundColor: pressed || on ? palette.navSelected : "transparent" })}
                        >
                          {badge(locale)}
                          <View style={{ flex: 1 }}>
                            <AText size={14} line={20} weight={on ? "semibold" : "medium"} color={palette.fg}>
                              {LOCALE_NAMES[locale].name}
                            </AText>
                            {other && other !== LOCALE_NAMES[locale].name ? (
                              <AText size={13} line={18} color={palette.muted}>
                                {other}
                              </AText>
                            ) : null}
                          </View>
                          {busy === locale ? <ActivityIndicator size="small" color={palette.muted} /> : on ? <Icon name="check-circle" size={18} color={palette.accentText} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Date and time`}>
        <RowGroup>
          <Pressable testID="language-date-format" accessibilityRole="button" onPress={() => setPicker("date")}>
            <ControlRow first icon="calendar" title={t`Date format`} description={t`Used in message timestamps and lists.`} control={<AText size={14} line={20} color={palette.muted}>{dateLabel(formats.date)}</AText>} />
          </Pressable>
          <Pressable testID="language-time-format" accessibilityRole="button" onPress={() => setPicker("time")}>
            <ControlRow icon="clock" title={t`Time format`} control={<AText size={14} line={20} color={palette.muted}>{timeLabel(formats.time)}</AText>} />
          </Pressable>
        </RowGroup>
      </SettingsSection>

      <RowGroup>
        <NavRow first external icon="translate" title={t`Contribute a language`} description={t`Help translate Zrzur into an existing or new language`} onPress={() => void openExternal("https://zrzur.com/translate")} />
      </RowGroup>

      <PickerSheet<string>
        visible={picker === "date"}
        title={t`Date format`}
        value={formats.date}
        options={DATE_FORMATS.map((f) => ({ value: f, label: dateLabel(f) }))}
        onPick={(date) => setFormats({ date })}
        onClose={() => setPicker(null)}
      />
      <PickerSheet<string>
        visible={picker === "time"}
        title={t`Time format`}
        value={formats.time}
        options={TIME_FORMATS.map((f) => ({ value: f, label: timeLabel(f) }))}
        onPick={(time) => setFormats({ time })}
        onClose={() => setPicker(null)}
      />
    </SettingsPage>
  );
}
