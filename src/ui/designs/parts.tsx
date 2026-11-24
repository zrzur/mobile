/**
 * The pieces every Designs screen draws with (web designs/Scenes.tsx,
 * Looks.tsx StyleCard, parts.tsx, ShowMore.tsx, FlockStage.tsx, Makers
 * sky): people wearing a style, a profile card, the sky, notices, the
 * "Show more" foot. Designs are always shown on the dark art ground, like a
 * profile card, so a preview looks the same in every app theme.
 */
import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useState } from "react";
import {
  I18nManager,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Defs,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
  SvgXml,
} from "react-native-svg";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { mix } from "@/theme/presets";
import { SKY_H, SKY_W, skyFlock, skyLayers, skyPath } from "@/ui/auth/flock";
import { Avatar } from "@/ui/Avatar";
import { DEFAULT_AVATARS } from "@/ui/defaultAvatars.generated";
import { defaultAvatarIndex } from "@/ui/defaultAvatar";
import { useCdn } from "@/ui/invite/media";
import {
  AText,
  Button,
  Icon,
  type IconName,
  PressScale,
  Skeleton,
} from "@/ui/kit";
import { Gradient } from "@/ui/profile/parts";
import { nameFontStyle } from "@/ui/settings/user/profile-look";

import type { CommunityCreator } from "./api";
import { crystalCave } from "./crystalCave";
import type { MoreState } from "./gallery";
import { type Person, useCast } from "./labels";
import {
  ART,
  NAMEPLATE_RATIO,
  type UserStyle,
  communityFileUrl,
  decorationUrl,
  isCommunityRef,
  nameplateUrl,
  sendableStyle,
  userStyleOf,
} from "./style";

/** The signed-in person, as Designs shows them */
export type Me = {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  style: UserStyle;
};

export function useMe(): Me | undefined {
  const client = useClient();
  const self = useSolid(
    useCallback(() => (client.ready() ? client.user : undefined), [client]),
  );
  const me = useFields(self, (u) => ({
    id: u.id,
    name: u.displayName ?? u.username,
    username: u.username,
    avatar: u.avatarURL,
    style: JSON.stringify((u as unknown as { style?: unknown }).style ?? null),
  }));
  return useMemo(
    () =>
      me
        ? { ...me, style: userStyleOf({ style: JSON.parse(me.style) }) }
        : undefined,
    [me],
  );
}

/** Save a whole style to your profile (web user.edit({ style })) */
export function useEditStyle() {
  const client = useClient();
  // by the API itself: the session works before the live connection is up
  return useCallback(
    async (style: UserStyle) => {
      await client.api.patch(
        "/users/@me" as never,
        { style: sendableStyle(style) } as never,
      );
    },
    [client],
  );
}

/**
 * Who wears a preview (web useWearer): the signed-in person, with their own
 * avatar and name; a sample person only before the account has loaded.
 */
export function useWearer() {
  const me = useMe();
  const cast = useCast();
  return useMemo(
    () => ({
      me,
      name: me?.name ?? cast[0].name,
      handle: me?.username ?? cast[0].name,
      who: (
        person?: Person,
      ): {
        name: string;
        handle: string;
        colour: string;
        face: number;
        avatar?: string;
      } => {
        const sample = person ?? cast[0];
        return me
          ? {
              name: me.name,
              handle: me.username,
              colour: sample.colour,
              face: sample.face,
              avatar: me.avatar,
            }
          : { ...sample, handle: sample.name };
      },
    }),
    [me, cast],
  );
}

/** A round picture: a person's own, or a face from Zrzur's avatar pack, never a letter */
export const Face = memo(function Face({
  size,
  url,
  face = 0,
  colour,
  name,
}: {
  size: number;
  url?: string;
  face?: number;
  colour?: string;
  name?: string;
}) {
  if (url) return <Avatar url={url} name={name} size={size} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: colour ?? ART.ground,
      }}
      accessibilityIgnoresInvertColors
    >
      <SvgXml
        xml={DEFAULT_AVATARS[Math.abs(face) % DEFAULT_AVATARS.length]}
        width={size}
        height={size}
      />
    </View>
  );
});

/** A creator's picture: their own, or the pack's face for their account */
export function CreatorFace({
  creator,
  size,
}: {
  creator?: CommunityCreator;
  size: number;
}) {
  const cdn = useCdn();
  const url =
    creator?.avatar?._id && cdn
      ? `${cdn}/avatars/${creator.avatar._id}`
      : undefined;
  return (
    <Face
      size={size}
      url={url}
      face={creator ? defaultAvatarIndex(creator._id) : 0}
    />
  );
}

/** A decoration drawn round whatever sits in a `size` circle (art 150 % of it) */
export function Decorated({
  size,
  art,
  children,
}: {
  size: number;
  art?: string;
  children: React.ReactNode;
}) {
  const outer = Math.round(size * 1.5);
  return (
    <View style={{ width: size, height: size }}>
      {children}
      {art ? (
        <Image
          source={{ uri: art }}
          accessibilityIgnoresInvertColors
          cachePolicy="memory-disk"
          recyclingKey={art}
          contentFit="contain"
          pointerEvents="none"
          style={{
            position: "absolute",
            width: outer,
            height: outer,
            top: (size - outer) / 2,
            start: (size - outer) / 2,
          }}
        />
      ) : null}
    </View>
  );
}

/** The wearer's avatar in a style's decoration; `other` is someone else (web WornAvatar) */
export function WornAvatar({
  size,
  style,
  person,
  other,
}: {
  size: number;
  style: UserStyle;
  person?: Person;
  other?: Person;
}) {
  const cdn = useCdn();
  const wearer = useWearer();
  const who = other ? { ...other, avatar: undefined } : wearer.who(person);
  return (
    <Decorated size={size} art={decorationUrl(style, cdn)}>
      <Face
        size={size}
        url={who.avatar}
        face={who.face}
        colour={who.colour}
        name={who.name}
      />
    </Decorated>
  );
}

/** The colour a name is drawn in: its own first colour, or `fallback` */
export const nameColour = (style: UserStyle | undefined, fallback: string) =>
  style?.name_colour?.[0] ?? fallback;

/** A display name in a style's font and colour */
export function StyledName({
  text,
  style,
  size,
  line,
  color,
  colour = true,
  shadow,
  numberOfLines = 1,
}: {
  text: string;
  style?: UserStyle;
  size: number;
  line: number;
  color: string;
  colour?: boolean;
  shadow?: boolean;
  numberOfLines?: number;
}) {
  return (
    <AText
      autoDir
      size={size}
      line={line}
      weight="bold"
      color={colour ? nameColour(style, color) : color}
      numberOfLines={numberOfLines}
      style={[nameFontStyle(style?.name_font), shadow ? TEXT_SHADOW : null]}
    >
      {text}
    </AText>
  );
}

/** keeps names readable on any banner or plate colour (web text-shadow) */
const TEXT_SHADOW = {
  textShadowColor: "rgba(0,0,0,0.7)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

/** One row of a member list, on the style's nameplate (web MemberRow) */
export function MemberRow({
  style,
  person,
  other,
  testID,
}: {
  style: UserStyle;
  person?: Person;
  /** someone else in the list, whoever is looking */ other?: Person;
  testID?: string;
}) {
  const { palette } = useTheme();
  const cdn = useCdn();
  const wearer = useWearer();
  const plate = nameplateUrl(style, cdn);
  const who = other ? { ...other, handle: other.name } : wearer.who(person);
  const row = (
    <>
      <View
        style={{
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WornAvatar size={32} style={style} person={person} other={other} />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            end: 0,
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: palette.frame,
            backgroundColor: palette.online,
          }}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <StyledName
          text={who.name}
          style={style}
          size={14}
          line={20}
          color={plate ? ART.ink : palette.fg2}
          colour={!plate}
          shadow={!!plate}
        />
      </View>
    </>
  );
  if (!plate)
    return (
      <View
        testID={testID}
        style={{
          height: 48,
          paddingHorizontal: 8,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        {row}
      </View>
    );
  return (
    <View
      testID={testID}
      style={{
        width: "100%",
        aspectRatio: NAMEPLATE_RATIO,
        borderRadius: 10,
        overflow: "hidden",
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Image
        source={{ uri: plate }}
        contentFit="fill"
        cachePolicy="memory-disk"
        recyclingKey={plate}
        style={StyleSheet.absoluteFill}
        accessibilityIgnoresInvertColors
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 10, borderWidth: 1, borderColor: ART.edge },
        ]}
      />
      {row}
    </View>
  );
}

/** Room round the card for its frame (web framedRoom / framedCompact) */
const FRAME_ROOM = {
  full: { top: 72, side: 42, bottom: 54 },
  compact: { top: 52, side: 30, bottom: 38 },
} as const;

/** The pixel size for a card this wide (web frameRoom.pixelSize) */
export const pixelSize = (width: number, phone = false) => {
  const cell = Math.min(4, Math.max(2, Math.round(width / 90)));
  return phone ? Math.min(cell, 3) : cell;
};

/** A profile card in its frame: the card keeps room round it for the frame (web FramedCard) */
export function FramedCard({
  frame,
  file,
  compact,
  children,
}: {
  frame?: string;
  file?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const cdn = useCdn();
  const [box, setBox] = useState<{ w: number; h: number }>();
  const room = compact ? FRAME_ROOM.compact : FRAME_ROOM.full;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width && height && (width !== box?.w || height !== box?.h))
      setBox({ w: width, h: height });
  };
  const art = useMemo(() => {
    if (!box || frame !== "crystal") return undefined;
    const drawn = crystalCave(
      Math.round(box.w),
      Math.round(box.h),
      pixelSize(box.w),
    );
    // the web's twinkle is a CSS animation: the phone shows the still drawing
    return {
      ...drawn,
      svg: drawn.svg
        .replace(/<g style="[^"]*">/g, "<g>")
        .replace(/ (aria-hidden|focusable|class)="[^"]*"/g, ""),
    };
  }, [box, frame]);
  if (!frame) return <>{children}</>;
  const community = isCommunityRef(frame)
    ? communityFileUrl(cdn, file)
    : undefined;
  const s = box ? box.w / 340 : 1;
  return (
    <View
      style={{
        marginTop: room.top,
        marginBottom: room.bottom,
        marginHorizontal: room.side,
      }}
    >
      <View onLayout={onLayout}>{children}</View>
      {art && box ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -art.room.x,
            top: -art.room.top,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <SvgXml
            xml={art.svg}
            width={box.w + 2 * art.room.x}
            height={box.h + art.room.top + art.room.bottom}
          />
        </View>
      ) : null}
      {community && box ? (
        <Image
          source={{ uri: community }}
          contentFit="fill"
          pointerEvents="none"
          accessibilityIgnoresInvertColors
          style={{
            position: "absolute",
            left: -30 * s,
            top: -70 * s,
            width: 400 * s,
            height: box.h + 110 * s,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * A profile card wearing a style: banner, avatar, name, handle and
 * nameplate (web StyleCard). Used at every size, so a design always shows
 * on the real thing; a frame reaches past it.
 */
export function StyleCard({
  style,
  compact,
  feature,
  person,
  testID,
}: {
  style: UserStyle;
  compact?: boolean;
  feature?: boolean;
  person?: Person;
  testID?: string;
}) {
  const cdn = useCdn();
  const wearer = useWearer();
  const who = wearer.who(person);
  const theme = style.theme?.length ? style.theme : ART.plainTheme;
  const top = theme[0];
  const bottom = theme[1] ?? theme[0];
  const plate = nameplateUrl(style, cdn);
  const banner = feature ? 120 : compact ? 48 : 64;
  const spotTop = feature ? -44 : -34;
  const card = (
    <View
      testID={testID}
      style={{
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: ART.edge,
      }}
    >
      <View style={{ height: banner }}>
        <Gradient from={top} to={bottom} diagonal />
      </View>
      <View
        style={{
          paddingTop: feature ? 64 : compact ? 40 : 48,
          paddingHorizontal: compact ? 12 : 14,
          paddingBottom: compact ? 12 : 14,
          gap: 12,
        }}
      >
        <Gradient
          from={mix(ART.ground, top, 0.14)}
          to={mix(ART.ground, bottom, 0.1)}
        />
        <View
          style={{
            position: "absolute",
            start: 14,
            top: spotTop,
            padding: 4,
            borderRadius: 999,
            backgroundColor: ART.ground,
          }}
        >
          <WornAvatar size={feature ? 80 : 60} style={style} person={person} />
        </View>
        <View style={{ gap: 2, minWidth: 0 }}>
          <StyledName
            text={who.name}
            style={style}
            size={18}
            line={24}
            color={ART.ink}
            shadow
          />
          <AText
            autoDir
            size={13}
            line={18}
            weight="semibold"
            color={ART.inkMuted}
            numberOfLines={1}
          >
            @{who.handle}
          </AText>
        </View>
        {plate ? (
          <View
            style={{
              width: "100%",
              aspectRatio: NAMEPLATE_RATIO,
              borderRadius: 8,
              overflow: "hidden",
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Image
              source={{ uri: plate }}
              contentFit="fill"
              cachePolicy="memory-disk"
              recyclingKey={plate}
              style={StyleSheet.absoluteFill}
              accessibilityIgnoresInvertColors
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: 8, borderWidth: 1, borderColor: ART.edge },
              ]}
            />
            <Face
              size={22}
              url={who.avatar}
              face={who.face}
              colour={who.colour}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <StyledName
                text={who.name}
                style={style}
                size={14}
                line={20}
                color="#FFFFFF"
                colour={false}
                shadow
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
  return style.profile_frame ? (
    <FramedCard
      frame={style.profile_frame}
      file={style.profile_frame_file}
      compact={compact}
    >
      {card}
    </FramedCard>
  ) : (
    card
  );
}

const FLOCK = skyFlock(200);
const LAYERS = skyLayers(FLOCK);

/**
 * The flock (web design/Sky.tsx): the app's calm birds in the muted ink, and
 * `lit` of them in the online colour, one per maker. Decoration only.
 */
export const DesignsSky = memo(function DesignsSky({
  lit = 0,
}: {
  lit?: number;
}) {
  const { palette } = useTheme();
  const count = Math.min(lit, 24);
  const litPath = useMemo(
    () =>
      skyPath(
        FLOCK.filter((_, i) => (i * 7) % FLOCK.length < count).map((bird) => ({
          ...bird,
          r: bird.r + 1.5,
        })),
      ),
    [count],
  );
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[
        StyleSheet.absoluteFill,
        { overflow: "hidden" },
        I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SKY_W} ${SKY_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <G fill={palette.muted}>
          {LAYERS.map((layer) => (
            <Path key={layer.opacity} d={layer.d} fillOpacity={layer.opacity} />
          ))}
        </G>
        {litPath ? <Path d={litPath} fill={palette.online} /> : null}
      </Svg>
    </View>
  );
});

/** The soft light at the top of a Designs page: the action colour, kept deep (web --z-designs-glow) */
export function Glow({ height }: { height: number }) {
  const { palette } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, start: 0, end: 0, height }}
    >
      <Svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <Defs>
          <RadialGradient
            id="dz-glow"
            cx="50"
            cy="-20"
            rx="90"
            ry="90"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={palette.accent} stopOpacity={0.16} />
            <Stop offset="0.7" stopColor={palette.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#dz-glow)" />
      </Svg>
    </View>
  );
}

/** Empty, error and "nothing found": real designs or one icon, one sentence, at most one action (web Notice) */
export function Notice({
  icon,
  art,
  title,
  children,
  action,
  role,
  testID,
}: {
  icon?: IconName;
  art?: React.ReactNode;
  title: string;
  children?: string;
  action?: {
    label: string;
    onPress: () => void;
    filled?: boolean;
    disabled?: boolean;
    testID?: string;
  };
  role?: "alert";
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole={role === "alert" ? "alert" : undefined}
      style={{
        alignItems: "center",
        gap: 12,
        paddingVertical: 56,
        paddingHorizontal: 16,
      }}
    >
      {art ? (
        <View aria-hidden style={{ marginBottom: 12 }}>
          {art}
        </View>
      ) : icon ? (
        <Icon name={icon} size={32} color={palette.muted} />
      ) : null}
      <AText
        size={18}
        line={26}
        weight="bold"
        color={palette.fg}
        style={{ textAlign: "center" }}
      >
        {title}
      </AText>
      {children ? (
        <AText
          size={15}
          line={24}
          color={palette.fg2}
          style={{ textAlign: "center", maxWidth: 440 }}
        >
          {children}
        </AText>
      ) : null}
      {action ? (
        <View style={{ marginTop: 8 }}>
          <Button
            label={action.label}
            variant={action.filled ? "primary" : "tonal"}
            disabled={action.disabled}
            onPress={action.onPress}
            testID={action.testID}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The error of every list of designs (web LoadError) */
export function LoadError({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLingui();
  return (
    <Notice
      role="alert"
      icon="warning-circle"
      title={t`Designs couldn't be loaded`}
      action={
        onRetry
          ? { label: t`Try again`, onPress: onRetry, testID: "designs-retry" }
          : undefined
      }
      testID="designs-load-error"
    >
      {t`Check your connection and try again in a moment.`}
    </Notice>
  );
}

/**
 * The foot of a paged list (web ShowMore): Zrzur's own "more" button, a dark
 * panel with a soft action-colour glow from its lower edge; the same button
 * waiting while the next page is on its way; one plain line at the end.
 */
export function ShowMore({
  state,
  onMore,
}: {
  state: MoreState;
  onMore: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  if (state === "none") return null;
  if (state === "end")
    return (
      <View style={{ paddingTop: 24, paddingBottom: 8, alignItems: "center" }}>
        <AText
          size={14}
          line={20}
          color={palette.muted}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {t`That's everything for now.`}
        </AText>
      </View>
    );
  const loading = state === "loading";
  return (
    <View style={{ paddingTop: 24, paddingBottom: 8, alignItems: "center" }}>
      <PressScale
        testID="designs-show-more"
        accessibilityRole="button"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        haptic="light"
        onPress={onMore}
        style={{
          minWidth: 168,
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: 10,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: `${palette.accent}61`,
          backgroundColor: palette.floating,
          alignItems: "center",
          justifyContent: "center",
          opacity: loading ? 0.75 : 1,
        }}
      >
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <Defs>
            <RadialGradient
              id="dz-more"
              cx="50"
              cy="125"
              rx="75"
              ry="90"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={palette.accent} stopOpacity={0.26} />
              <Stop offset="0.72" stopColor={palette.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#dz-more)" />
        </Svg>
        <AText size={15} line={20} weight="semibold" color={palette.fg}>
          {loading ? t`Loading…` : t`Show more`}
        </AText>
      </PressScale>
    </View>
  );
}

/** A dashed ring: a place nobody fills yet (web OpenRing / Empty) */
export function OpenRing({ size = 88 }: { size?: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: palette.borderStrong,
      }}
    />
  );
}

/** Placeholders in the shape of what is on its way */
export function Holder({ width, height }: { width: number; height: number }) {
  return <Skeleton width={width} height={height} radius={14} />;
}
