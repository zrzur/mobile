/**
 * You, at the bottom of Designs (web designs/Dock.tsx): everything you tap
 * lands on your own avatar here. The bar opens the whole mirror in a sheet;
 * Save is the one action. A design that lands makes the ring pop (the web
 * flies a copy of the tile to it; the phone answers with the pop and a tap).
 */
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorDetails, errorText } from "@/auth/errorText";
import { toAuthError } from "@/auth/flow";
import { useTheme } from "@/theme/ThemeProvider";
import { ErrorBox } from "@/ui/auth/parts";
import {
  AText,
  Button,
  Icon,
  PressScale,
  SheetModal,
  useReduceMotion,
} from "@/ui/kit";

import { useTryOn } from "./hooks";
import { showsSaved } from "./tryOn";
import { Mirror } from "./Mirror";
import { StyledName, WornAvatar, useWearer } from "./parts";

/** Room the dock takes at the bottom of a screen (bar, its margin and the home bar) */
export const DOCK_ROOM = 96;

/** An API failure in plain words, the technical part under Details */
export function DesignsError({ error }: { error: unknown }) {
  const { i18n } = useLingui();
  const failure = toAuthError(error);
  return (
    <ErrorBox
      message={errorText(i18n, failure)}
      details={errorDetails(failure)}
    />
  );
}

export function Dock() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const tryOn = useTryOn();
  const wearer = useWearer();
  const reduce = useReduceMotion();
  const [open, setOpen] = useState(false);
  const { state } = tryOn;

  // a design landed on you: the ring pops
  const pop = useSharedValue(1);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  useEffect(() => {
    if (!state.landed || reduce) return;
    pop.set(
      withSequence(
        withTiming(1.22, { duration: 120 }),
        withTiming(1, { duration: 120 }),
      ),
    );
  }, [state.landed, reduce, pop]);

  const subtitle =
    state.lastName ??
    (tryOn.changed ? t`Not saved yet` : t`Tap any design to try it on`);
  const saving = state.saving;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          start: 0,
          end: 0,
          bottom: 0,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingHorizontal: 16,
          alignItems: "center",
        }}
      >
        <View
          testID="designs-dock"
          accessibilityLabel={t`Your look`}
          style={{
            width: "100%",
            maxWidth: 480,
            gap: 8,
            padding: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.floating,
            shadowColor: palette.shadow,
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          {state.error && !open ? <DesignsError error={state.error} /> : null}
          {showsSaved(state, tryOn.changed) ? (
            <View
              testID="designs-dock-saved"
              accessibilityRole="alert"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 8,
              }}
            >
              <Icon name="check-circle" size={16} color={palette.onlineText} />
              <AText
                size={13}
                line={20}
                color={palette.onlineText}
                style={{ flex: 1 }}
              >
                {t`Saved to your profile.`}
              </AText>
              <PressScale
                testID="designs-dock-undo"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void tryOn.undo()}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 8,
                }}
              >
                <AText
                  size={13}
                  line={20}
                  weight="semibold"
                  color={palette.fg}
                  style={{ textDecorationLine: "underline" }}
                >
                  {t`Undo`}
                </AText>
              </PressScale>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <PressScale
              testID="designs-dock-you"
              accessibilityRole="button"
              accessibilityLabel={t`Show preview`}
              accessibilityState={{ expanded: open }}
              haptic="light"
              scale={0.98}
              onPress={() => setOpen(true)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingStart: 4,
                paddingEnd: 8,
                borderRadius: 10,
                backgroundColor: pressed ? palette.navHover : "transparent",
                minWidth: 0,
              })}
            >
              <Animated.View
                style={[
                  {
                    width: 48,
                    height: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  ring,
                ]}
              >
                <WornAvatar size={40} style={tryOn.draft} />
              </Animated.View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <StyledName
                  text={wearer.name}
                  style={tryOn.draft}
                  size={15}
                  line={20}
                  color={palette.fg}
                />
                <AText
                  autoDir
                  size={12}
                  line={16}
                  color={palette.muted}
                  numberOfLines={1}
                >
                  {subtitle}
                </AText>
              </View>
              <Icon name="caret-up" size={16} color={palette.muted} />
            </PressScale>
            {tryOn.changed ? (
              <Button
                label={saving ? t`Saving…` : t`Save`}
                status={saving ? "submitting" : "ready"}
                onPress={() => void tryOn.save()}
                testID="designs-dock-save"
              />
            ) : null}
          </View>
        </View>
      </View>

      <SheetModal
        visible={open}
        onClose={() => setOpen(false)}
        scroll
        testID="designs-dock-sheet"
      >
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <AText size={17} line={24} weight="bold" color={palette.header}>
            {t`Your look`}
          </AText>
          <Mirror style={tryOn.draft} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tryOn.parts.length ? (
              tryOn.parts.map((part) => (
                <View
                  key={part.key}
                  style={{
                    height: 44,
                    maxWidth: "100%",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingStart: 12,
                    borderRadius: 10,
                    backgroundColor: palette.field,
                  }}
                >
                  <AText
                    autoDir
                    size={13}
                    line={18}
                    weight="medium"
                    color={palette.fg}
                    numberOfLines={1}
                    style={{ flexShrink: 1 }}
                  >
                    {part.label}
                  </AText>
                  <PressScale
                    testID={`designs-part-off-${part.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={t`Take off ${part.label}`}
                    onPress={() => tryOn.put(part.clear)}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="x" size={12} color={palette.muted} />
                  </PressScale>
                </View>
              ))
            ) : (
              <AText size={13} line={20} color={palette.muted}>
                {t`Nothing on yet. Pick something to try on.`}
              </AText>
            )}
          </View>
          {state.error ? <DesignsError error={state.error} /> : null}
          {tryOn.changed ? (
            <View style={{ gap: 8 }}>
              <Button
                label={saving ? t`Saving…` : t`Save`}
                status={saving ? "submitting" : "ready"}
                fill
                onPress={() =>
                  void tryOn.save().then((done) => done && setOpen(false))
                }
                testID="designs-sheet-save"
              />
              <Button
                label={t`Reset`}
                variant="tonal"
                fill
                onPress={tryOn.reset}
                testID="designs-sheet-reset"
              />
            </View>
          ) : null}
        </View>
      </SheetModal>
    </>
  );
}
