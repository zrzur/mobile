import { useLingui } from "@lingui/react/macro";
import * as Device from "expo-device";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";

import { type Animations, type ReduceMotion, useTheme } from "@/theme/ThemeProvider";
import { ACCENTS, type Preset, PRESETS, type PresetId, type ThemeMode, presetById } from "@/theme/presets";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { ControlRow, SettingsPage, SettingsSection, Toggle } from "../parts";
import { useHapticsSetting } from "@/ui/kit/haptics";
import { Segmented, StackRow } from "./userParts";

/** A device with 4 GB or more counts as strong enough for animations */
const STRONG_DEVICE = (Device.totalMemory ?? 0) >= 4 * 1024 ** 3;

/**
 * Appearance (web: AppearanceMenu), kept on this device. On the phone:
 * theme presets, mode, accent colour and the two animation switches. The
 * web's layout/text sliders, fonts, emoji packs, saved themes and the
 * per-area animation editor are desktop tools and are left out (spec §12).
 */
export function AppearancePage() {
  const { t } = useLingui();
  const { palette, appearance, setAppearance } = useTheme();
  const [deviceReduce, setDeviceReduce] = useState(false);
  const [haptic, setHaptic] = useHapticsSetting();

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setDeviceReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => setDeviceReduce(on));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const text: Record<PresetId, { name: string; description: string }> = {
    "signature-dark": { name: t`Midnight Pulse`, description: t`Gaming dark: deep midnight panels, Raspberry for actions and Neon Pink for highlights.` },
    graphite: { name: t`Graphite`, description: t`Cool graphite panels for long sessions. Same raspberry actions and pink highlights.` },
    amoled: { name: t`AMOLED`, description: t`Near-black for OLED screens. Soft steps so the eye stays comfortable.` },
    daylight: { name: t`Daylight`, description: t`Clean light surfaces with deep ink text and Raspberry actions.` },
    "high-contrast": { name: t`High Contrast`, description: t`Pure black and white with a bright accent, larger text, clear focus rings and underlined links, for low vision and bright screens.` },
    paper: { name: t`Paper`, description: t`A calm light theme in soft paper tones for bright rooms and daytime reading.` },
    "desert-dawn": { name: t`Desert Dawn`, description: t`A warm dark theme in sand and copper tones, easy on the eyes in the evening.` },
  };

  // the preset in effect: a mode that differs from the saved preset shows its default
  const effective = (() => {
    const saved = presetById(appearance.preset);
    if (saved && (saved.mode === "dark") === palette.dark) return saved.id;
    return palette.dark ? "signature-dark" : "daylight";
  })();
  const accent = appearance.accent ?? presetById(effective)?.accent ?? palette.accent;

  const animationHelp =
    appearance.animations === "off"
      ? t`Nothing moves. This is the default.`
      : appearance.animations === "on"
        ? t`Animations always play, with the settings below.`
        : STRONG_DEVICE
          ? t`Only on strong devices. This device is strong enough, so animations play.`
          : t`Only on strong devices. This device is not strong enough, so animations stay off.`;

  return (
    <SettingsPage title={t`Appearance`} testID="user-appearance">
      <SettingsSection title={t`Theme`} description={t`Pick a look, then fine-tune accent, layout and fonts below.`}>
        {/* web ThemeLibrary: the theme tiles and Mode share one card */}
        <RowGroup>
          <View accessibilityRole="radiogroup" accessibilityLabel={t`Theme`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 }}>
            {PRESETS.map((p) => (
              <ThemeTile key={p.id} preset={p} name={text[p.id].name} description={text[p.id].description} on={p.id === effective} onPress={() => setAppearance({ preset: p.id, mode: p.mode, accent: null })} />
            ))}
          </View>
          <StackRow icon="circle-half" title={t`Mode`} description={t`System follows your device's light or dark setting.`}>
            <Segmented<ThemeMode>
              label={t`Mode`}
              value={appearance.mode}
              onChange={(mode) => setAppearance({ mode })}
              options={[
                { value: "dark", label: t`Dark`, icon: "moon" },
                { value: "light", label: t`Light`, icon: "sun" },
                { value: "system", label: t`System`, icon: "monitor" },
              ]}
            />
          </StackRow>
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Colours`} description={t`Accent colours actions and selection. Outline icons stay muted.`}>
        <RowGroup>
          <StackRow first icon="palette" title={t`Accent colour`} description={t`Buttons, switches, links and selected items.`}>
            <View accessibilityRole="radiogroup" accessibilityLabel={t`Accent colour`} style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {ACCENTS.map((c) => {
                const on = c.toLowerCase() === accent.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    testID={`accent-${c.slice(1)}`}
                    accessibilityRole="radio"
                    accessibilityLabel={t`Accent ${c}`}
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    onPress={() => setAppearance({ accent: c })}
                    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: on ? c : "transparent" }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.borderSoft }}>
                        {on ? <Icon name="check" size={16} color={palette.onAccent} /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </StackRow>
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Animations`} description={t`Choose how each part of Zrzur moves. The preview shows every change right away.`}>
        <RowGroup>
          <StackRow first icon="sparkle" title={t`Use animations`} description={animationHelp}>
            <Segmented<Animations>
              label={t`Use animations`}
              value={appearance.animations}
              onChange={(animations) => setAppearance({ animations })}
              options={[
                { value: "off", label: t`Off` },
                { value: "auto", label: t`Automatic` },
                { value: "on", label: t`On` },
              ]}
            />
          </StackRow>
          {appearance.animations !== "off" ? (
            <StackRow title={t`Reduce motion`} description={`${t`Swaps movement and zoom for short fades.`} ${deviceReduce ? t`Your device asks for less motion.` : t`Your device allows full motion.`}`}>
              <Segmented<ReduceMotion>
                label={t`Reduce motion`}
                value={appearance.reduceMotion}
                onChange={(reduceMotion) => setAppearance({ reduceMotion })}
                options={[
                  { value: "device", label: t`Follow device` },
                  { value: "reduce", label: t`Reduce` },
                  { value: "full", label: t`Full` },
                ]}
              />
            </StackRow>
          ) : null}
        </RowGroup>
      </SettingsSection>

      {Platform.OS !== "web" ? (
        <SettingsSection title={t`Haptics`} description={t`Short vibrations when you switch tabs, flip a switch, swipe a row, open a menu or send a message. Kept on this device.`}>
          <RowGroup>
            <ControlRow first icon="device-mobile" title={t`Haptics`} control={<Toggle testID="haptics-toggle" label={t`Haptics`} value={haptic} onChange={setHaptic} />} />
          </RowGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

/**
 * One theme tile (web ThemeTile): a tiny window drawn from the preset's own
 * palette (rail, sidebar with the accent bar, chat with a composer), then
 * the name with the accent dots, or a check when it is in use.
 */
function ThemeTile({ preset, name, description, on, onPress }: { preset: Preset; name: string; description: string; on: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const [app, sidebar, chat, raised] = preset.swatches;
  // the hairlines inside the thumbnail follow the preset, not the app theme
  const line = preset.mode === "light" ? "rgba(21,24,32,0.14)" : "rgba(238,241,247,0.14)";
  const bar = (width: `${number}%`, colour = line) => <View style={{ height: 4, width, borderRadius: 2, backgroundColor: colour }} />;
  return (
    <Pressable
      testID={`theme-${preset.id}`}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: 156,
        flexGrow: 1,
        padding: 8,
        gap: 8,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: on ? palette.accent : pressed ? palette.borderStrong : palette.tonalBorder,
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      <View style={{ height: 60, borderRadius: 6, overflow: "hidden", flexDirection: "row", backgroundColor: app, borderWidth: 1, borderColor: line }}>
        <View style={{ width: "12%", backgroundColor: app }} />
        <View style={{ width: "30%", paddingVertical: 8, paddingHorizontal: 4, gap: 4, backgroundColor: sidebar }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: preset.accent, opacity: 0.85 }} />
          {bar("100%")}
          {bar("100%")}
        </View>
        <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, gap: 4, justifyContent: "flex-end", backgroundColor: chat }}>
          {bar("70%")}
          {bar("45%")}
          <View style={{ height: 8, borderRadius: 3, backgroundColor: raised }} />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, minHeight: 20 }}>
        <AText size={13} line={20} weight="medium" color={on ? palette.fg : palette.fg2} style={{ flex: 1 }} numberOfLines={1}>
          {name}
        </AText>
        {on ? (
          <View style={{ width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: palette.accent }}>
            <Icon name="check" size={12} color={palette.onAccent} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[preset.accent, ...preset.dots].map((c, i) => (
              <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}
