/**
 * One design's own page (web designs/DesignPage.tsx): a large preview on
 * your profile, what it is, who made it, and one way to use it; a few more
 * of the same kind under it. Built-in designs (look-…, decoration-…,
 * nameplate-…, colours-…) and community ones (their id) share it.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useCdn } from "@/ui/invite/media";
import {
  AText,
  Button,
  Icon,
  PressScale,
  Skeleton,
  copyToClipboard,
  haptics,
} from "@/ui/kit";

import {
  type CommunityItemDetails,
  communityApi,
  communityFramesOpen,
  hasOpenPage,
} from "./api";
import { CreatorChip, fieldOf, useWearDesign } from "./DesignSheet";
import { type DesignRef, designSlug, parseDesignSlug } from "./designSlug";
import { DesignsError } from "./Dock";
import type { WallFilter } from "./gallery";
import { useTryOn } from "./hooks";
import { useLookText, useStyleLabels } from "./labels";
import { Mirror } from "./Mirror";
import { StyleCard, useEditStyle, useMe } from "./parts";
import { DesignsScreen } from "./Screen";
import {
  DECORATIONS,
  LOOKS,
  NAMEPLATES,
  THEME_PRESETS,
  type UserStyle,
  effectFileUrl,
  wearsAll,
} from "./style";

/** The web app's address of a design: shared links open it in the app or on the web */
export const designLink = (slug: string) =>
  `https://app.zrzur.com/designs/${slug}`;

type Resolved = {
  ref: DesignRef;
  kind: string;
  name: string;
  description?: string;
  /** what wearing it changes */
  style: UserStyle;
  /** the part of the wall that shows it */
  tab: Exclude<WallFilter, "all">;
  community?: CommunityItemDetails;
};

/** the image of a community design, so a preview can draw it */
function communityFile(item: Resolved): UserStyle {
  const found = item.community?.item;
  if (!found) return {};
  return { [`${fieldOf(found)}_file`]: found.file._id };
}

export function DesignPageScreen({ slug }: { slug: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const cdn = useCdn();
  const me = useMe();
  const labels = useStyleLabels();
  const lookText = useLookText();
  const tryOn = useTryOn();
  const edit = useEditStyle();
  const wearDesign = useWearDesign();
  const wide = useWindowDimensions().width > 900;
  const [design, setDesign] = useState<Resolved | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [copied, setCopied] = useState(false);
  const [replay, setReplay] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const ref = parseDesignSlug(slug);
    const resolve = async (): Promise<Resolved | null> => {
      if (!ref) return null;
      switch (ref.kind) {
        case "look": {
          const look = LOOKS.find((entry) => entry.id === ref.id);
          if (!look) return null;
          const [name, description] = lookText(look.id);
          return {
            ref,
            kind: t`Profile look`,
            name,
            description,
            style: look.style,
            tab: "looks",
          };
        }
        case "decoration":
          if (!DECORATIONS.includes(ref.id)) return null;
          return {
            ref,
            kind: t`Avatar decoration`,
            name: labels.decoration(ref.id),
            style: { decoration: ref.id },
            tab: "decorations",
          };
        case "nameplate":
          if (!NAMEPLATES.some((entry) => entry.id === ref.id)) return null;
          return {
            ref,
            kind: t`Nameplate`,
            name: labels.nameplate(ref.id),
            style: { nameplate: ref.id },
            tab: "nameplates",
          };
        case "colours": {
          const preset = THEME_PRESETS.find((entry) => entry.id === ref.id);
          if (!preset) return null;
          return {
            ref,
            kind: t`Profile colours`,
            name: labels.theme(ref.id),
            style: { theme: [...preset.colours] },
            tab: "colours",
          };
        }
        case "community": {
          const details = await communityApi
            .details(client, ref.id)
            .catch(() => undefined);
          if (!details) return null;
          const made = details.item.kind;
          // creators' frames are not shown while the server has them closed
          if (made === "Frame" && !communityFramesOpen(client)) return null;
          return {
            ref,
            kind:
              made === "Decoration"
                ? t`Avatar decoration`
                : made === "Effect"
                  ? t`Profile effect`
                  : made === "Frame"
                    ? t`Profile frame`
                    : t`Nameplate`,
            name: details.item.name,
            description: details.item.description,
            style: { [fieldOf(details.item)]: `c:${ref.id}` },
            tab:
              made === "Effect"
                ? "effects"
                : made === "Frame"
                  ? "frames"
                  : "community",
            community: details,
          };
        }
      }
    };
    void resolve().then((found) => live && setDesign(found));
    return () => {
      live = false;
    };
    // the names follow the language; the slug and version pick the design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, client, version]);

  const worn = !!design && wearsAll(me?.style, design.style);

  async function use(item: Resolved) {
    if (!me) return;
    setBusy(true);
    setError(undefined);
    try {
      if (item.community)
        await wearDesign(
          fieldOf(item.community.item),
          `c:${item.ref.id}`,
          item.community.item.file._id,
        );
      else {
        // a look is worn whole; any other part changes that part and keeps the rest
        const next =
          item.ref.kind === "look"
            ? item.style
            : { ...(me?.style ?? {}), ...item.style };
        await edit(next);
        tryOn.put(next);
      }
      haptics.success();
    } catch (failure) {
      setError(failure);
      haptics.error();
    } finally {
      setBusy(false);
    }
  }

  const tryIt = (item: Resolved) => {
    tryOn.put({ ...item.style, ...communityFile(item) });
    router.push(`/designs/${item.tab}` as never);
  };

  const copyLink = (item: Resolved) =>
    void copyToClipboard(designLink(designSlug(item.ref))).then(() => {
      setCopied(true);
      haptics.success();
      setTimeout(() => setCopied(false), 2000);
    });

  /** a few more of the same kind (built-in designs) */
  const similar = (item: Resolved): DesignRef[] => {
    const pick = (kind: DesignRef["kind"], ids: readonly string[]) =>
      ids
        .filter((id) => id !== item.ref.id)
        .slice(0, 5)
        .map((id) => ({ kind, id }) as DesignRef);
    switch (item.ref.kind) {
      case "look":
        return pick(
          "look",
          LOOKS.map((look) => look.id),
        );
      case "nameplate":
        return pick(
          "nameplate",
          NAMEPLATES.map((plate) => plate.id),
        );
      case "colours":
        return pick(
          "colours",
          THEME_PRESETS.map((preset) => preset.id),
        );
      default:
        return pick("decoration", DECORATIONS);
    }
  };
  const styleOf = (ref: DesignRef): UserStyle => {
    if (ref.kind === "look")
      return LOOKS.find((look) => look.id === ref.id)?.style ?? {};
    if (ref.kind === "nameplate") return { nameplate: ref.id };
    if (ref.kind === "colours")
      return {
        theme: THEME_PRESETS.find((preset) => preset.id === ref.id)?.colours,
      };
    return { decoration: ref.id };
  };
  const nameOf = (ref: DesignRef) =>
    ref.kind === "look"
      ? lookText(ref.id)[0]
      : ref.kind === "nameplate"
        ? labels.nameplate(ref.id)
        : ref.kind === "colours"
          ? labels.theme(ref.id)
          : labels.decoration(ref.id);

  const effect =
    design?.community?.item.kind === "Effect"
      ? effectFileUrl(cdn, design.community.item.file._id)
      : undefined;

  return (
    <DesignsScreen
      testID="designs-design"
      back={() =>
        router.canGoBack() ? router.back() : router.replace("/designs" as never)
      }
      dock={false}
      onRefresh={async () => setVersion((v) => v + 1)}
    >
      {(actions) =>
        design === undefined
          ? [<Skeleton key="loading" width="100%" height={360} radius={14} />]
          : design === null
            ? [
                <View
                  key="missing"
                  testID="design-missing"
                  style={{
                    maxWidth: 480,
                    alignSelf: "center",
                    marginVertical: 80,
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Icon name="sparkle" size={32} color={palette.fg2} />
                  <AText
                    size={18}
                    line={26}
                    weight="bold"
                    color={palette.fg}
                    style={{ textAlign: "center" }}
                  >
                    {t`This design isn't available.`}
                  </AText>
                  <AText
                    size={15}
                    line={22}
                    color={palette.fg2}
                    style={{ textAlign: "center" }}
                  >
                    {t`It may have been taken down, or the link is mistyped.`}
                  </AText>
                  <Button
                    label={t`Browse Designs`}
                    variant="ghost"
                    onPress={() => router.replace("/designs" as never)}
                    testID="design-browse"
                  />
                </View>,
              ]
            : [
                <View
                  key="crumbs"
                  accessibilityLabel={t`Breadcrumb`}
                  style={{
                    paddingTop: 12,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <PressScale
                    testID="design-crumb-designs"
                    accessibilityRole="link"
                    onPress={() => router.replace("/designs" as never)}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <AText size={13} line={18} color={palette.fg2}>
                      {t`Designs`}
                    </AText>
                  </PressScale>
                  <Icon name="caret-right" size={14} color={palette.muted} />
                  <AText size={13} line={18} color={palette.muted}>
                    {design.kind}
                  </AText>
                  <Icon name="caret-right" size={14} color={palette.muted} />
                  <AText
                    autoDir
                    size={13}
                    line={18}
                    weight="semibold"
                    color={palette.fg}
                    numberOfLines={1}
                    style={{ flexShrink: 1 }}
                  >
                    {design.name}
                  </AText>
                </View>,
                <View
                  key="columns"
                  style={{
                    flexDirection: wide ? "row" : "column",
                    gap: wide ? 40 : 24,
                    paddingTop: 8,
                  }}
                >
                  <View
                    accessibilityLabel={t`Preview`}
                    style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 8 }}
                  >
                    {effect ? (
                      <>
                        <View
                          testID="effect-stage"
                          style={{
                            width: "100%",
                            maxWidth: 360,
                            alignSelf: "center",
                            aspectRatio: 9 / 16,
                            borderRadius: 10,
                            overflow: "hidden",
                            backgroundColor: palette.frame,
                            padding: 8,
                          }}
                        >
                          <StyleCard style={{}} feature />
                          <Image
                            key={replay}
                            source={{ uri: effect }}
                            contentFit="cover"
                            style={{
                              position: "absolute",
                              top: 0,
                              bottom: 0,
                              start: 0,
                              end: 0,
                            }}
                            accessibilityIgnoresInvertColors
                          />
                        </View>
                        <Ghost
                          icon="play"
                          label={t`Play again`}
                          onPress={() => setReplay((n) => n + 1)}
                          testID="effect-play"
                        />
                      </>
                    ) : (
                      <Mirror
                        style={{ ...design.style, ...communityFile(design) }}
                      />
                    )}
                    <AText size={12} line={16} color={palette.muted}>
                      {t`Shown on your own profile.`}
                    </AText>
                  </View>
                  <View style={{ width: wide ? 380 : undefined, gap: 20 }}>
                    <View style={{ gap: 8 }}>
                      <AText
                        size={13}
                        line={18}
                        weight="semibold"
                        color={palette.muted}
                      >
                        {design.kind}
                      </AText>
                      <AText
                        autoDir
                        size={28}
                        line={36}
                        weight="bold"
                        color={palette.fg}
                        accessibilityRole="header"
                        testID="design-name"
                      >
                        {design.name}
                      </AText>
                      {design.description ? (
                        <AText autoDir size={15} line={24} color={palette.fg2}>
                          {design.description}
                        </AText>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <View
                        style={{
                          height: 28,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          justifyContent: "center",
                          backgroundColor: palette.field,
                        }}
                      >
                        <AText
                          size={13}
                          line={18}
                          weight="semibold"
                          color={palette.fg}
                        >
                          {t`Free`}
                        </AText>
                      </View>
                    </View>
                    <View
                      accessibilityLiveRegion="polite"
                      style={{
                        padding: 20,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: palette.borderSubtle,
                        backgroundColor: palette.field,
                        gap: 12,
                      }}
                    >
                      {worn ? (
                        <View
                          testID="design-worn"
                          style={{
                            minHeight: 48,
                            borderRadius: 10,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            backgroundColor: `${palette.online}24`,
                          }}
                        >
                          <Icon
                            name="check"
                            size={18}
                            color={palette.onlineText}
                          />
                          <AText
                            size={15}
                            line={20}
                            weight="semibold"
                            color={palette.onlineText}
                          >
                            {t`On your profile now`}
                          </AText>
                        </View>
                      ) : (
                        <Button
                          label={t`Use this design`}
                          status={busy ? "submitting" : "ready"}
                          disabled={!me}
                          fill
                          onPress={() => void use(design)}
                          testID="design-use"
                        />
                      )}
                      <Button
                        label={t`Try it in the fitting room`}
                        variant="tonal"
                        disabled={!tryOn.ready}
                        fill
                        onPress={() => tryIt(design)}
                        testID="design-try"
                      />
                      {error ? <DesignsError error={error} /> : null}
                    </View>
                    <View style={{ gap: 12 }}>
                      <Detail term={t`Made by`}>
                        {design.community?.creator ? (
                          <CreatorChip
                            creator={design.community.creator}
                            onPress={
                              hasOpenPage(design.community.creator)
                                ? () =>
                                    router.push(
                                      `/designs/creator/${design.community!.creator!._id}` as never,
                                    )
                                : undefined
                            }
                          />
                        ) : (
                          <AText size={14} line={20} color={palette.fg}>
                            {t`The Zrzur team`}
                          </AText>
                        )}
                      </Detail>
                      <Detail term={t`Link`}>
                        <AText
                          size={14}
                          line={20}
                          color={palette.fg}
                          style={{ writingDirection: "ltr" }}
                        >
                          {designLink(designSlug(design.ref)).replace(
                            /^https?:\/\//,
                            "",
                          )}
                        </AText>
                      </Detail>
                    </View>
                    <View style={{ alignItems: "flex-start", gap: 4 }}>
                      <Ghost
                        icon={copied ? "check" : "link"}
                        label={copied ? t`Copied` : t`Copy link`}
                        onPress={() => copyLink(design)}
                        testID="design-copy"
                      />
                      {design.community ? (
                        <Ghost
                          icon="flag"
                          label={t`Report`}
                          onPress={() =>
                            actions.onReport({
                              id: design.ref.id,
                              label: design.name,
                            })
                          }
                          testID="design-report"
                        />
                      ) : null}
                    </View>
                  </View>
                </View>,
                similar(design).length ? (
                  <View key="more" style={{ gap: 16, paddingTop: 24 }}>
                    <AText
                      size={22}
                      line={30}
                      weight="bold"
                      color={palette.fg}
                      accessibilityRole="header"
                    >
                      {t`More like this`}
                    </AText>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: wide ? 16 : 8,
                      }}
                    >
                      {similar(design).map((ref) => (
                        <PressScale
                          key={designSlug(ref)}
                          testID={`design-similar-${designSlug(ref)}`}
                          accessibilityRole="link"
                          scale={0.97}
                          onPress={() =>
                            router.push(`/designs/${designSlug(ref)}` as never)
                          }
                          style={{
                            width: wide ? "31%" : "48.5%",
                            padding: 12,
                            gap: 10,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: palette.borderSubtle,
                            backgroundColor: palette.field,
                          }}
                        >
                          <StyleCard style={styleOf(ref)} compact />
                          <AText
                            autoDir
                            size={14}
                            line={20}
                            weight="semibold"
                            color={palette.fg}
                            numberOfLines={1}
                          >
                            {nameOf(ref)}
                          </AText>
                        </PressScale>
                      ))}
                    </View>
                  </View>
                ) : null,
              ]
      }
    </DesignsScreen>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <AText size={14} line={20} color={palette.muted}>
        {term}
      </AText>
      <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>
        {children}
      </View>
    </View>
  );
}

function Ghost({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: "play" | "check" | "link" | "flag";
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 8,
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      <Icon name={icon} size={18} color={palette.fg2} />
      <AText size={14} line={20} color={palette.fg2}>
        {label}
      </AText>
    </PressScale>
  );
}
