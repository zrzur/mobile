/**
 * The people behind the designs (web designs/Makers.tsx): every creator as
 * a nest in the sky, sitting in their best decoration with what they made
 * circling them; then one creator's page, their name set large on their own
 * art and their wall under it.
 */
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  View,
  useWindowDimensions,
} from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useCdn } from "@/ui/invite/media";
import { AText, Button, Icon, PressScale, Skeleton } from "@/ui/kit";

import { type CreatorProfile, communityApi, creatorName } from "./api";
import type { Wear } from "./gallery";
import { useCommunity, useCommunityTiles, usePaged, wearOf } from "./hooks";
import { useCast } from "./labels";
import {
  CreatorFace,
  Decorated,
  DesignsSky,
  Glow,
  LoadError,
  MemberRow,
  Notice,
  OpenRing,
  ShowMore,
  WornAvatar,
} from "./parts";
import { mergePages, rankCreators, type RankedCreator } from "./rank";
import { DesignsScreen, pagePadding } from "./Screen";
import { DECORATIONS, communityFileUrl } from "./style";
import { Wall } from "./Wall";

/** where the pieces sit around a maker, as a share of the nest */
const orbit = (i: number, count: number) => {
  const turn = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + Math.cos(turn) * 40, y: 50 + Math.sin(turn) * 40 };
};

/** One maker: a nest. They sit in the middle, what they made circles them (web Nest) */
function Nest({
  face,
  name,
  verified,
  line,
  works,
  first,
  open,
  onPress,
  testID,
}: {
  face: React.ReactNode;
  name: string;
  verified?: boolean;
  line: string;
  works: Wear[];
  first?: boolean;
  open?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const cast = useCast();
  const [size, setSize] = useState(0);
  const max = open ? 240 : first ? 520 : 400;
  const onLayout = (e: LayoutChangeEvent) =>
    setSize(Math.min(max, Math.round(e.nativeEvent.layout.width)));
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      disabled={!onPress}
      scale={0.98}
      onPress={onPress}
      onLayout={onLayout}
      style={{ alignItems: "center", gap: 4 }}
    >
      <View style={{ width: size || max, maxWidth: "100%", aspectRatio: 1 }}>
        {/* the line the work flies on */}
        <View
          style={{
            position: "absolute",
            top: "10%",
            bottom: "10%",
            start: "10%",
            end: "10%",
            borderRadius: 999,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: palette.borderStrong,
          }}
        />
        {size
          ? works.map((wear, i) => {
              const at = orbit(i, works.length);
              const plate = !!wear.nameplate;
              const w = plate ? (size < 360 ? 148 : 200) : 72;
              const h = plate ? w / (448 / 84) : 72;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: w,
                    left: (at.x / 100) * size - w / 2,
                    top: (at.y / 100) * size - h / 2,
                  }}
                >
                  {plate ? (
                    <MemberRow
                      style={wear}
                      person={cast[(i + 2) % cast.length]}
                    />
                  ) : (
                    <WornAvatar
                      size={72}
                      style={wear}
                      person={cast[(i + 2) % cast.length]}
                    />
                  )}
                </View>
              );
            })
          : null}
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {face}
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          maxWidth: "100%",
        }}
      >
        <AText
          autoDir
          size={28}
          line={34}
          weight="bold"
          color={palette.fg}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {name}
        </AText>
        {verified ? (
          <View accessibilityLabel={t`Verified creator`}>
            <Icon name="seal-check" size={20} color={palette.fg2} />
          </View>
        ) : null}
      </View>
      <AText
        size={15}
        line={24}
        color={palette.fg2}
        style={{ textAlign: "center" }}
      >
        {line}
      </AText>
    </PressScale>
  );
}

/** The creators as a sky of nests: every lit bird is someone who draws (web CreatorsScene) */
export function CreatorsScreen() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const cdn = useCdn();
  const [version, setVersion] = useState(0);
  const community = useCommunity({ sort: "popular" }, version);
  const ranked = useMemo(
    () =>
      rankCreators(
        mergePages([
          {
            items: community.items,
            creators: Object.values(community.creators),
          },
        ]),
      ),
    [community.items, community.creators],
  );
  // a nest holds up to six worn designs: twelve nests are about two screens
  const paged = usePaged(ranked, {
    key: () => "creators",
    more: community.more,
    loading: community.loading,
    onMore: community.next,
    page: 12,
  });
  const wide = width >= 900;

  const face = (entry: RankedCreator) => {
    const frame = entry.shelf.find((item) => item.kind === "Decoration");
    return (
      <Decorated
        size={112}
        art={frame ? communityFileUrl(cdn, frame.file._id) : undefined}
      >
        <CreatorFace creator={entry.creator} size={112} />
      </Decorated>
    );
  };

  const nests = [
    ...paged.shown.map((entry, i) => (
      <Nest
        key={entry.creator._id}
        testID={`designs-nest-${entry.creator._id}`}
        first={i === 0}
        face={face(entry)}
        name={creatorName(entry.creator)}
        verified={entry.creator.verified}
        line={`${plural(entry.designs, { one: "# design", other: "# designs" })} · ${t`Worn by ${entry.uses}`}`}
        works={entry.shelf.map(wearOf)}
        onPress={
          entry.creator.open_page
            ? () =>
                router.push(`/designs/creator/${entry.creator._id}` as never)
            : undefined
        }
      />
    )),
    <Nest
      key="team"
      testID="designs-nest-team"
      first={!ranked.length}
      face={<WornAvatar size={112} style={{ decoration: "laurel" }} />}
      name={t`The Zrzur team`}
      line={t`Everything that ships with Zrzur`}
      works={DECORATIONS.slice(0, 6).map((decoration) => ({ decoration }))}
      onPress={() => router.replace("/designs" as never)}
    />,
    // the place held for the next one: Creator Studio is on the web
    <Nest
      key="spot"
      testID="designs-nest-spot"
      open
      face={<OpenRing size={112} />}
      name={t`Your spot`}
      line={t`Publish a design and you show up here.`}
      works={[]}
    />,
  ];

  return (
    <DesignsScreen
      testID="designs-creators"
      chapter="creators"
      onRefresh={community.reload}
      onChanged={() => setVersion((v) => v + 1)}
      above={
        <View style={{ height: 320, marginBottom: -200 }}>
          <Glow height={320} />
          <DesignsSky lit={ranked.length + 1} />
        </View>
      }
    >
      {() => [
        <View key="head" style={{ paddingTop: 24, gap: 16 }}>
          <AText
            size={wide ? 72 : 48}
            line={wide ? 76 : 53}
            weight="bold"
            color={palette.fg}
            accessibilityRole="header"
            style={{ maxWidth: 560 }}
          >
            {t`The people behind the designs`}
          </AText>
          <AText
            size={18}
            line={26}
            color={palette.fg2}
            style={{ maxWidth: 480 }}
          >
            {t`Every lit bird in this sky is someone who draws for Zrzur.`}
          </AText>
        </View>,
        <View
          key="nests"
          style={{
            marginTop: 40,
            flexDirection: wide ? "row" : "column",
            flexWrap: "wrap",
            gap: wide ? 24 : 32,
          }}
        >
          {nests.map((nest, i) => (
            <View
              key={nest.key}
              style={{
                width: wide ? "48%" : "100%",
                marginTop: wide && i % 2 === 1 ? 120 : 0,
              }}
            >
              {nest}
            </View>
          ))}
        </View>,
        <ShowMore key="more" state={paged.state} onMore={paged.next} />,
        community.failed ? (
          <LoadError key="error" onRetry={community.retry} />
        ) : null,
      ]}
    </DesignsScreen>
  );
}

/** One creator: their name set large on their own art, then their wall (web CreatorPage) */
export function CreatorScreen({ id }: { id: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const cdn = useCdn();
  const window = useWindowDimensions();
  const toTiles = useCommunityTiles();
  const [data, setData] = useState<CreatorProfile | null>();
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  const settle = useCallback(
    (answer: Promise<CreatorProfile>, alive: () => boolean) =>
      answer.then(
        (found) => {
          if (!alive()) return;
          setFailed(false);
          setData(found);
        },
        (error) => {
          if (!alive()) return;
          if ((error as { status?: number }).status === 404) setData(null);
          else setFailed(true);
        },
      ),
    [],
  );
  const load = () => settle(communityApi.creator(client, id), () => true);
  useEffect(() => {
    let alive = true;
    void settle(communityApi.creator(client, id), () => alive);
    return () => {
      alive = false;
    };
  }, [client, id, version, settle]);

  const lookup = useMemo(
    () => (data ? { [data.creator._id]: data.creator } : {}),
    [data],
  );
  const ranked = data
    ? rankCreators({ items: data.items, creators: lookup })[0]
    : undefined;
  const tiles = useMemo(
    () =>
      data
        ? toTiles(data.items, lookup).map((tile, i) => ({
            ...tile,
            big: i % 5 === 0,
          }))
        : [],
    [data, lookup, toTiles],
  );
  const cover = ranked?.cover
    ? communityFileUrl(cdn, ranked.cover.file._id)
    : undefined;
  const signHeight = Math.round(
    Math.min(400, Math.max(240, window.height * 0.44)),
  );
  const pad = pagePadding(window.width);
  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.replace("/designs/creators" as never);

  return (
    <DesignsScreen
      testID="designs-creator"
      chapter="creators"
      onRefresh={load}
      onChanged={() => setVersion((v) => v + 1)}
      above={
        data ? (
          <View
            testID="designs-creator-sign"
            style={{
              height: signHeight,
              overflow: "hidden",
              backgroundColor: palette.field,
            }}
          >
            {cover ? (
              <Image
                source={{ uri: cover }}
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
            ) : (
              <DesignsSky lit={1} />
            )}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                start: pad,
                end: pad,
                alignItems: "flex-start",
              }}
            >
              <PressScale
                testID="designs-creator-back"
                accessibilityRole="button"
                onPress={back}
                style={{
                  minHeight: 44,
                  marginBottom: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "#171925",
                }}
              >
                <Icon name="caret-left" size={16} color="#F7F8FC" />
                <AText size={14} line={20} weight="semibold" color="#F7F8FC">
                  {t`All creators`}
                </AText>
              </PressScale>
              <View
                style={{
                  maxWidth: "100%",
                  paddingTop: 8,
                  paddingBottom: 4,
                  paddingHorizontal: 16,
                  borderTopStartRadius: 14,
                  borderTopEndRadius: 14,
                  backgroundColor: palette.frame,
                }}
              >
                <AText
                  autoDir
                  size={48}
                  line={52}
                  weight="bold"
                  color={palette.fg}
                  numberOfLines={1}
                  accessibilityRole="header"
                >
                  {creatorName(data.creator)}
                </AText>
              </View>
            </View>
          </View>
        ) : undefined
      }
    >
      {(actions) =>
        data === undefined && !failed
          ? [
              <Skeleton
                key="sign"
                width="100%"
                height={signHeight}
                radius={14}
              />,
            ]
          : failed
            ? [<LoadError key="error" onRetry={() => void load()} />]
            : data === null
              ? [
                  <Notice
                    key="none"
                    icon="user-circle"
                    title={t`Creator not found`}
                    action={{
                      label: t`All creators`,
                      onPress: () =>
                        router.replace("/designs/creators" as never),
                    }}
                    testID="designs-creator-missing"
                  >
                    {t`This creator has no published designs.`}
                  </Notice>,
                ]
              : [
                  <View
                    key="facts"
                    style={{
                      paddingVertical: 16,
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <CreatorFace creator={data!.creator} size={56} />
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <AText
                        autoDir
                        size={15}
                        line={24}
                        weight="semibold"
                        color={palette.fg}
                        numberOfLines={1}
                      >
                        {creatorName(data!.creator)}
                      </AText>
                      <AText size={13} line={20} color={palette.fg2}>
                        {`${plural(data!.items.length, { one: "# design", other: "# designs" })} · ${t`Worn by ${ranked?.uses ?? 0}`}`}
                      </AText>
                    </View>
                    <Button
                      label={t`View profile`}
                      variant="tonal"
                      onPress={() => router.push(`/profile/${id}` as never)}
                      testID="designs-creator-profile"
                    />
                  </View>,
                  <Wall
                    key="wall"
                    tiles={tiles}
                    {...actions}
                    testID="designs-creator-wall"
                  />,
                ]
      }
    </DesignsScreen>
  );
}
