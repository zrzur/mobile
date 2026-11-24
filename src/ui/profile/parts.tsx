import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
  SvgXml,
} from "react-native-svg";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import {
  decorationArt,
  isCommunityRef,
} from "@/ui/settings/user/profile-catalog";
import { badgeMeta } from "@/ui/settings/user/profile-logic";

import { BADGE_ART } from "./badgeArt";
import { HEX, mixColours, profileColours } from "./theme";

/**
 * The colours a profile is drawn in (web: --profile-ink, --profile-line,
 * --profile-chip...). A themed profile is drawn on its own gradient in light
 * ink (made readable as on the web); any other on the app's surfaces.
 */
export type ProfileInk = {
  themed: boolean;
  /** the gradient of a themed profile */
  top?: string;
  bottom?: string;
  /** solid colour under the content (the gradient's foot when themed) */
  surface: string;
  /** the ring that cuts the avatar out of the banner */
  ring: string;
  /** a banner without a picture: a solid colour, or two for a gradient */
  bannerBg: string;
  bannerTo?: string;
  ink: string;
  /** secondary text (bio, member since) */
  ink2: string;
  /** labels, the tag, placeholders */
  muted: string;
  line: string;
  chip: string;
  chipPressed: string;
  /** the status bubble */
  bubble: string;
  link: string;
  /** the tonal button inside the profile */
  button: string;
  buttonPressed: string;
};

const InkContext = createContext<ProfileInk | null>(null);

export function useProfileInkFor(theme: string[] | undefined): ProfileInk {
  const { palette } = useTheme();
  return useMemo(() => {
    const c = profileColours(theme);
    if (c)
      return {
        themed: true,
        top: c.top,
        bottom: c.bottom,
        surface: c.bottom,
        ring: c.top,
        bannerBg: c.banner,
        ink: c.ink,
        ink2: c.ink2,
        muted: c.muted,
        line: c.line,
        chip: c.chip,
        chipPressed: c.chipPressed,
        bubble: c.bubble,
        link: c.ink,
        button: c.bubble,
        buttonPressed: c.chipPressed,
      };
    // web: accent 55 % over the raised surface, to accent 18 % over the app
    const raised = HEX.test(palette.tonal) ? palette.tonal : palette.frame;
    return {
      themed: false,
      surface: palette.frame,
      ring: palette.frame,
      bannerBg: mixColours(raised, palette.accent, 0.55),
      bannerTo: mixColours(palette.frame, palette.accent, 0.18),
      ink: palette.fg,
      ink2: palette.fg2,
      muted: palette.muted,
      line: palette.borderSubtle,
      chip: palette.field,
      chipPressed: palette.navSelected,
      bubble: palette.tonal,
      link: palette.link,
      button: palette.tonal,
      buttonPressed: palette.tonalHover,
    };
  }, [theme, palette]);
}

export function InkProvider({
  ink,
  children,
}: {
  ink: ProfileInk;
  children: ReactNode;
}) {
  return <InkContext.Provider value={ink}>{children}</InkContext.Provider>;
}

export function useInk(): ProfileInk {
  const ink = useContext(InkContext);
  if (!ink) throw new Error("useInk outside a profile");
  return ink;
}

/** A two-stop gradient filling its parent (top to bottom, or 135° when `diagonal`) */
export function Gradient({
  from,
  to,
  diagonal,
}: {
  from: string;
  to: string;
  diagonal?: boolean;
}) {
  const id = `g${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, start: 0, end: 0, bottom: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient
            id={id}
            x1="0"
            y1="0"
            x2={diagonal ? "1" : "0"}
            y2="1"
          >
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The surface of a whole profile: its gradient when themed */
export function ProfileBackdrop() {
  const ink = useInk();
  return ink.themed && ink.top && ink.bottom ? (
    <Gradient from={ink.top} to={ink.bottom} />
  ) : null;
}

/** One titled part of a profile: a small label over its content, a line above */
export function Section({
  title,
  first,
  action,
  children,
  label,
}: {
  title?: string;
  first?: boolean;
  action?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  const ink = useInk();
  return (
    <View
      accessibilityLabel={label}
      style={{
        gap: 8,
        minWidth: 0,
        paddingTop: first ? 0 : 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: ink.line,
      }}
    >
      {title ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <AText
            size={12}
            line={16}
            weight="semibold"
            color={ink.muted}
            accessibilityRole="header"
            style={{ flexShrink: 1 }}
          >
            {title}
          </AText>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A small chip (link, role, mutual): 28 px, 44 px when it can be pressed (web `chip`) */
export function Chip({
  children,
  onPress,
  leading,
  label,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  leading?: ReactNode;
  label?: string;
  testID?: string;
}) {
  const ink = useInk();
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        maxWidth: "100%",
        minHeight: onPress ? 44 : 28,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: ink.line,
        backgroundColor: pressed ? ink.chipPressed : ink.chip,
      })}
    >
      {leading}
      {children}
    </Pressable>
  );
}

export function ChipText({
  children,
  strong,
}: {
  children: string;
  strong?: boolean;
}) {
  const ink = useInk();
  return (
    <AText
      size={12}
      line={16}
      weight={strong ? "semibold" : "medium"}
      color={ink.ink}
      numberOfLines={1}
      autoDir
      style={{ flexShrink: 1 }}
    >
      {children}
    </AText>
  );
}

/** Square icon button on the profile's surface: the chip's colours, 44 px (web edgeButton) */
export function EdgeButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const ink = useInk();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: ink.line,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? ink.chipPressed : ink.chip,
      })}
    >
      <Icon name={icon} size={18} color={ink.ink} />
    </Pressable>
  );
}

/**
 * The tonal 44 px button of a profile (web Button tonal inside the card). The
 * kit Button reads the app palette; a themed profile needs its own tonal, so
 * this keeps the kit's metrics (radius 10, 16 px sides, 15/600) in the
 * profile's colours. The one filled action uses the kit Button.
 */
export function ProfileButton({
  label,
  icon,
  iconOnly,
  onPress,
  busy,
  testID,
}: {
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  onPress: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const ink = useInk();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 44,
        minWidth: 44,
        flexShrink: iconOnly ? 0 : 1,
        paddingHorizontal: iconOnly ? 0 : 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: ink.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: pressed ? ink.buttonPressed : ink.button,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink.ink} />
      ) : icon ? (
        <Icon name={icon} size={16} color={ink.ink} />
      ) : null}
      {iconOnly ? null : (
        <AText
          size={15}
          line={20}
          weight="semibold"
          color={ink.ink}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {label}
        </AText>
      )}
    </Pressable>
  );
}

/** An avatar with its decoration and presence dot (web AvatarDecoration + Avatar) */
export function ProfileAvatar({
  url,
  name,
  size,
  decoration,
  decorationUri,
  presence,
}: {
  url?: string;
  name?: string;
  size: number;
  decoration?: string;
  /** the decoration's picture when the caller has it (a creator's design too) */
  decorationUri?: string;
  presence?: string;
}) {
  const art =
    decorationUri ??
    (decoration && !isCommunityRef(decoration)
      ? decorationArt(decoration)
      : undefined);
  const outer = Math.round(size * 1.5);
  return (
    <View style={{ width: size, height: size }}>
      <Avatar url={url} name={name} size={size} presence={presence as never} />
      {art ? (
        <Image
          source={{ uri: art }}
          accessibilityIgnoresInvertColors
          style={{
            position: "absolute",
            width: outer,
            height: outer,
            top: (size - outer) / 2,
            start: (size - outer) / 2,
          }}
          contentFit="contain"
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

// native SVG has no drop-shadow filter: keep the art and leave the lift out there
const NO_FILTERS = (body: string) =>
  body
    .replace(/<filter[\s\S]*?<\/filter>/g, "")
    .replace(/\sfilter="url\([^)]*\)"/g, "");

/**
 * A badge's art: the approved enamel pins (web BadgeGlyph, badge art v2).
 * An id this build has no art for draws its two colours round a medal.
 */
export function BadgeMark({ id, size = 20 }: { id: string; size?: number }) {
  const { palette } = useTheme();
  const uid = `zb${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  const body = BADGE_ART[id];
  const xml = useMemo(() => {
    if (!body) return null;
    const art = body.replaceAll("{{ID}}", uid);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" overflow="visible">${Platform.OS === "web" ? art : NO_FILTERS(art)}</svg>`;
  }, [body, uid]);
  if (xml)
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <SvgXml xml={xml} width={size} height={size} />
      </View>
    );
  const meta = badgeMeta(id);
  const [a, b] = meta?.colours ?? [palette.tonal, palette.tonal];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: a,
        borderWidth: Math.max(2, Math.round(size / 14)),
        borderColor: b,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="medal" size={Math.round(size * 0.55)} color={palette.knob} />
    </View>
  );
}

/**
 * Bot / Verified bot / Official bot label beside a name (web BadgeTag
 * filled): 16 px pill in the Zrzur colour, 11/700 capitals.
 */
export function BotLabel({
  official,
  verified,
}: {
  official?: boolean;
  verified?: boolean;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = official ? t`Official bot` : t`Bot`;
  return (
    <View
      accessible
      accessibilityLabel={
        verified
          ? `${t`Verified bot`}: ${t`The Zrzur team reviewed this bot.`}`
          : text
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 4,
        backgroundColor: palette.accent,
        flexShrink: 0,
      }}
    >
      {verified || official ? (
        <Icon name="check" size={12} color={palette.onAccent} />
      ) : null}
      <AText
        size={11}
        line={14}
        weight="bold"
        color={palette.onAccent}
        style={{ textTransform: "uppercase", letterSpacing: 0.4 }}
        maxFontSizeMultiplier={1.2}
      >
        {text}
      </AText>
    </View>
  );
}
