import { useLingui } from "@lingui/react/macro";
import { type ReactNode, forwardRef, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
} from "react-native";

import { fontFamily } from "@/theme/fonts";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";

import { Icon } from "../Icon";
import { inputDirStyle, isLatinInput } from "../kit/bidi";
import { Button } from "../kit/Button";
import { AText } from "../kit/Text";

export { AText } from "../kit/Text";

/** h1 22/30 bold, optional subtitle 15/24 */
export function FlowTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View>
      <AText size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header">
        {children}
      </AText>
      {subtitle ? (
        <AText size={15} line={24} color={palette.fg2} style={{ marginTop: 4 }}>
          {subtitle}
        </AText>
      ) : null}
    </View>
  );
}

export function FlowText({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <AText size={15} line={22} color={palette.fg2}>
      {children}
    </AText>
  );
}

export type ButtonStatus = "ready" | "submitting" | "success";

/** The filled 44 px button (web: Button filled, size xl); fills the row */
export function AuthButton({
  children,
  onPress,
  status = "ready",
  disabled,
  testID,
}: {
  children: string;
  onPress?: () => void;
  status?: ButtonStatus;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Button label={children} onPress={onPress} status={status} disabled={disabled} testID={testID} fill />
    </View>
  );
}

/** ← Back (or another label): transparent, fg-secondary */
export function BackButton({ label, onPress }: { label?: string; onPress: () => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const text = label ?? t`Back`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: RADIUS,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      <Icon name="arrow-left" size={18} color={palette.fg2} />
      <AText size={15} line={22} weight="medium" color={palette.fg2}>
        {text}
      </AText>
    </Pressable>
  );
}

/** [Back] + the primary button filling the rest */
export function FlowActions({
  back,
  backLabel,
  children,
}: {
  back?: () => void;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%", marginTop: 8 }}>
      {back ? <BackButton label={backLabel} onPress={back} /> : null}
      {children}
    </View>
  );
}

/** Centred blue links under a form */
export function FlowLinks({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 4, width: "100%" }}
    >
      {children}
    </View>
  );
}

export function FlowLink({ children, onPress, testID }: { children: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 4, borderRadius: 4, justifyContent: "center" }}
    >
      {({ pressed }) => (
        <AText
          size={14}
          line={21}
          weight="medium"
          color={palette.link}
          style={pressed ? { textDecorationLine: "underline" } : undefined}
        >
          {children}
        </AText>
      )}
    </Pressable>
  );
}

/** The server's answer in plain words, with the technical part under "Details" */
export function ErrorBox({ message, details }: { message: ReactNode; details?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}
    >
      <View style={{ marginTop: 2 }}>
        <Icon name="warning-circle" size={16} color={palette.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <AText size={14} line={20} color={palette.fg}>
          {message}
        </AText>
        {details ? (
          <View style={{ marginTop: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpen((v) => !v)}
              style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignSelf: "flex-start" }}
            >
              <AText size={12} line={16} color={palette.muted}>
                {(open ? "▾ " : "▸ ") + t`Details`}
              </AText>
            </Pressable>
            {open ? (
              <Text
                selectable
                style={{ marginTop: 4, fontSize: 12, color: palette.muted, fontFamily: "monospace", writingDirection: "ltr", textAlign: "left" }}
              >
                {details}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The error line under a field: icon 14 + 12/16 medium in the danger colour */
export function FieldError({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLiveRegion="polite">
      <Icon name="warning-circle" size={14} color={palette.danger} />
      <AText size={12} line={16} weight="medium" color={palette.danger} style={{ flexShrink: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/**
 * The one text field: label 13/600, a 44 px box (radius 10, 12 px padding,
 * field border token) on field-bg, accent border while focused. The input
 * itself spans the full 44 px (the border is drawn over it), so the whole
 * box is the tap target.
 *
 * The typed text takes its own direction like dir="auto" on the web (Arabic
 * starts on the right even in the English app); fields that only hold Latin
 * text (password, email, URL, numbers, one-time codes, or `latin`) run left
 * to right once typed.
 */
export const TextField = forwardRef<
  TextInputInstance,
  TextInputProps & {
    label: string;
    error?: string;
    helper?: string;
    password?: boolean;
    /** always Latin text: left to right once typed */
    latin?: boolean;
    /** content at the end of the box (unit, button) */ end?: ReactNode;
  }
>(function TextField({ label, error, helper, password, latin, end, onFocus, onBlur, onChangeText, style, multiline, ...rest }, ref) {
  const { palette } = useTheme();
  const { t, i18n } = useLingui();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  // an uncontrolled field (no value) still follows what is typed
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const dirStyle = inputDirStyle(rest.value ?? typed ?? rest.defaultValue, { latin: latin || password || isLatinInput(rest) });
  const border = error ? palette.danger : focused ? palette.accent : palette.fieldBorder;
  return (
    <View style={{ gap: 8 }}>
      <AText size={13} line={20} weight="semibold" color={focused ? palette.fg : palette.fg2}>
        {label}
      </AText>
      <View
        style={{
          minHeight: FIELD_HEIGHT,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: 8,
          borderRadius: RADIUS,
          backgroundColor: palette.field,
        }}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          aria-invalid={!!error}
          placeholderTextColor={palette.muted}
          selectionColor={palette.accent}
          cursorColor={palette.accent}
          secureTextEntry={password && !shown}
          multiline={multiline}
          // the keyboard follows the app's theme; passwords are never corrected or capitalised;
          // single-line fields close with Done unless the form asks for Next or Go
          keyboardAppearance={palette.dark ? "dark" : "light"}
          autoCapitalize={password ? "none" : undefined}
          autoCorrect={password ? false : undefined}
          returnKeyType={multiline ? undefined : "done"}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onChangeText={(v) => {
            setTyped(v);
            onChangeText?.(v);
          }}
          {...rest}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: FIELD_HEIGHT,
              paddingVertical: 12,
              paddingHorizontal: 0,
              fontSize: 16,
              lineHeight: 20,
              color: palette.fg,
              fontFamily: fontFamily(i18n.locale),
              // empty: the placeholder follows the language (the full stop stays at the end in Arabic); typed: the text's own direction
              ...dirStyle,
            },
            style,
          ]}
        />
        {end}
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? t`Hide password` : t`Show password`}
            onPress={() => setShown((v) => !v)}
            style={{ width: 44, height: 44, marginEnd: -12, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={shown ? "eye-slash" : "eye"} size={18} color={palette.muted} />
          </Pressable>
        ) : null}
        {/* the border sits over the input so the input keeps the full height */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            borderRadius: RADIUS,
            borderWidth: 1,
            borderColor: border,
            // the web's 1 px focus shadow: a second ring drawn outside
            outlineColor: focused ? border : "transparent",
            outlineWidth: focused ? 1 : 0,
            outlineStyle: "solid",
          }}
        />
      </View>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : helper ? (
        <AText size={12} line={16} color={palette.muted}>
          {helper}
        </AText>
      ) : null}
    </View>
  );
});

/** Height of the one text field and of buttons (web phone: 44 px) */
export const FIELD_HEIGHT = 44;

/** Fades and slides each flow in, like the web (280 ms) */
export function FlowEnter({ children }: { children: ReactNode }) {
  const value = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: 280,
      easing: Easing.bezier(0.05, 0.7, 0.1, 1),
      // the web build has no native animation module
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [value]);
  return (
    <Animated.View
      style={{
        width: "100%",
        opacity: value,
        transform: [
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
