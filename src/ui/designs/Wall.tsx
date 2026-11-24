/**
 * The wall (web designs/Wall.tsx): a page of tiles and "Show more" for the
 * next, every kind in its own shape. A tap on a tile's art tries it on and
 * it lands on you in the dock; a tap on its name opens the design. Laid out
 * like the web's grid (grid.ts): on a phone every tile is the width of the
 * page, one under the other; an iPad gets the web's mixed six-column wall.
 */
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { useCdn } from "@/ui/invite/media";
import { AText, Icon, PressScale } from "@/ui/kit";
import { Gradient } from "@/ui/profile/parts";

import type { CommunityItem } from "./api";
import { columnsFor, packGrid, type Shape, spanOf } from "./grid";
import { type Tile, usePaged, useTryOn } from "./hooks";
import { useCast, useStyleLabels, useVibeLine, useVibeText } from "./labels";
import {
  CreatorFace,
  Holder,
  LoadError,
  MemberRow,
  Notice,
  OpenRing,
  ShowMore,
  StyleCard,
  StyledName,
  WornAvatar,
  useMe,
  useWearer,
} from "./parts";
import { ART, LOOKS, THEME_PRESETS, VIBES, effectStillUrl } from "./style";

export type WallActions = {
  /** a community design's details (a sheet) */
  onOpen: (item: CommunityItem) => void;
  /** a built-in design's page */
  onDesign: (slug: string) => void;
  onMood?: (mood: string) => void;
  onMaker?: (id: string) => void;
};

/** The width the wall is laid out at, and the window it is shown in */
function useWallWidth() {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(0);
  return {
    window: window.width,
    width,
    onLayout: (e: LayoutChangeEvent) => {
      const next = Math.round(e.nativeEvent.layout.width);
      if (next && next !== width) setWidth(next);
    },
  };
}

export function Wall({
  tiles,
  more,
  loading,
  onMore,
  testID = "designs-wall",
  ...actions
}: {
  tiles: Tile[];
  more?: boolean;
  loading?: boolean;
  onMore?: () => void;
  testID?: string;
} & WallActions) {
  const paged = usePaged(tiles, {
    key: (tile) => tile.key,
    more,
    loading,
    onMore,
  });
  const { window, width, onLayout } = useWallWidth();
  const shapes = paged.shown.map((tile) =>
    spanOf(tile.kind as Shape, !!tile.big, window),
  );
  const grid = width ? packGrid(shapes, columnsFor(window), width) : undefined;
  return (
    <View>
      <View
        testID={testID}
        onLayout={onLayout}
        style={{ height: grid?.height ?? 0 }}
      >
        {grid
          ? paged.shown.map((tile, i) => {
              const box = grid.boxes[i];
              return (
                <View
                  key={tile.key}
                  style={{
                    position: "absolute",
                    start: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                  }}
                >
                  <WallTile tile={tile} {...actions} />
                </View>
              );
            })
          : null}
      </View>
      <ShowMore state={paged.state} onMore={paged.next} />
    </View>
  );
}

function WallTile({ tile, ...actions }: { tile: Tile } & WallActions) {
  switch (tile.kind) {
    case "paint":
      return <PaintBand />;
    case "maker":
      return <MakerTile tile={tile} onMaker={actions.onMaker} />;
    case "mood":
      return <MoodTile mood={tile.mood!} onMood={actions.onMood} />;
    default:
      return <DesignTile tile={tile} {...actions} />;
  }
}

/** The name under a tile's art; a tap opens the design (web Caption) */
function Caption({ tile, onOpen, onDesign }: { tile: Tile } & WallActions) {
  const body = (
    <>
      <AText
        autoDir
        size={13}
        line={20}
        weight="semibold"
        color={ART.ink}
        numberOfLines={1}
      >
        {tile.name}
      </AText>
      {tile.maker ? (
        <AText
          autoDir
          size={12}
          line={16}
          color={ART.inkMuted}
          numberOfLines={1}
        >
          <Trans>
            by{" "}
            <AText size={12} line={16} color={ART.inkMuted}>
              {tile.maker}
            </AText>
          </Trans>
        </AText>
      ) : null}
    </>
  );
  if (!tile.slug)
    return (
      <View style={{ paddingTop: 4, paddingBottom: 8, paddingHorizontal: 12 }}>
        {body}
      </View>
    );
  return (
    <Pressable
      testID={`design-caption-${tile.key}`}
      accessibilityRole="link"
      onPress={() => (tile.item ? onOpen(tile.item) : onDesign(tile.slug!))}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        paddingTop: 4,
        paddingBottom: 8,
        paddingHorizontal: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {body}
    </Pressable>
  );
}

/** A tile with art that tries on, and its caption (web DesignTile) */
function DesignTile({ tile, ...actions }: { tile: Tile } & WallActions) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const tryOn = useTryOn();
  const on = !!tile.wear && tryOn.wearing(tile.wear);
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: ART.ground,
      }}
    >
      <PressScale
        testID={`design-tile-${tile.key}`}
        accessibilityRole="button"
        accessibilityLabel={t`Try on ${tile.name}`}
        accessibilityState={{ selected: on }}
        aria-pressed={on}
        disabled={!tile.wear}
        scale={0.98}
        onPress={() => tile.wear && tryOn.toggle(tile.wear, tile.name)}
        style={{
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: tile.kind === "card" ? "flex-start" : "center",
          padding: tile.kind === "effect" ? 0 : tile.kind === "plate" ? 0 : 8,
          paddingHorizontal: tile.kind === "plate" ? 8 : undefined,
          overflow: "hidden",
        }}
      >
        <TileArt tile={tile} />
      </PressScale>
      {tile.name ? <Caption tile={tile} {...actions} /> : null}
      {/* tried on: the focus colour round the tile (web data-on) */}
      {on ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: palette.focus,
          }}
        />
      ) : null}
    </View>
  );
}

function TileArt({ tile }: { tile: Tile }) {
  const me = useMe();
  const wear = tile.wear ?? {};
  switch (tile.kind) {
    case "effect":
      return <EffectStill tile={tile} />;
    case "look":
      return (
        <View style={{ width: "100%" }}>
          <StyleCard style={wear} person={tile.person} compact />
        </View>
      );
    case "frame":
      return (
        <WornAvatar
          size={tile.big ? 208 : 72}
          style={wear}
          person={tile.person}
        />
      );
    case "plate":
      return (
        <View style={{ width: "100%" }}>
          <MemberRow style={wear} person={tile.person} />
        </View>
      );
    case "card":
      // signed in: your own look with this frame round it
      return (
        <View style={{ width: "100%", paddingTop: 4 }}>
          <StyleCard
            style={{ ...(me?.style ?? {}), ...wear }}
            person={tile.person}
            compact
          />
        </View>
      );
    case "open":
      return <OpenRing />;
    case "type":
    case "ink":
      return <Word tile={tile} />;
    default:
      return null;
  }
}

/** A name in a font, or in a colour (web Word): a long name gets smaller until it fits */
function Word({ tile }: { tile: Tile }) {
  const wearer = useWearer();
  const ink = tile.kind === "ink";
  return (
    <View style={{ width: "100%", alignItems: "center" }}>
      <StyledName
        text={wearer.who(tile.person).name}
        style={tile.wear}
        size={ink ? 16 : 28}
        line={ink ? 24 : 36}
        color={ART.ink}
      />
    </View>
  );
}

/**
 * An effect's tile, as tall as a profile card. A creator's effect shows the
 * still the media server draws; Zrzur's own effects are drawn by the web
 * app's effect engine, which the phone does not have yet, so they show a
 * quiet poster with their name.
 */
function EffectStill({ tile }: { tile: Tile }) {
  const cdn = useCdn();
  const still = tile.item
    ? effectStillUrl(cdn, tile.wear?.effect_file)
    : undefined;
  if (still)
    return (
      <Image
        source={{ uri: still }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={still}
        style={{ width: "100%", height: "100%" }}
        accessibilityIgnoresInvertColors
      />
    );
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Gradient from={ART.ground} to="#242638" />
      <Icon name="sparkle" size={40} color={ART.inkMuted} />
    </View>
  );
}

/** Someone who makes these (web MakerTile) */
function MakerTile({
  tile,
  onMaker,
}: {
  tile: Tile;
  onMaker?: (id: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={`design-maker-${tile.creator?._id ?? tile.key}`}
      accessibilityRole="button"
      disabled={!tile.makerId}
      scale={0.98}
      onPress={() => tile.makerId && onMaker?.(tile.makerId)}
      style={{
        flex: 1,
        justifyContent: "flex-end",
        alignItems: "flex-start",
        gap: 4,
        padding: 16,
        borderRadius: 14,
        backgroundColor: palette.field,
      }}
    >
      <CreatorFace creator={tile.creator} size={72} />
      <AText
        autoDir
        size={22}
        line={30}
        weight="bold"
        color={palette.fg}
        numberOfLines={1}
      >
        {tile.name}
      </AText>
      <AText size={13} line={20} color={palette.fg2}>
        {plural(tile.count ?? 0, { one: "# design", other: "# designs" })}
      </AText>
    </PressScale>
  );
}

/** Every profile colour at once: stripes the height of the tile (web PaintBand) */
function PaintBand() {
  const labels = useStyleLabels();
  const { palette } = useTheme();
  const tryOn = useTryOn();
  return (
    <View style={{ flex: 1, borderRadius: 14, overflow: "hidden" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {THEME_PRESETS.map((preset) => {
          const wear = { theme: [...preset.colours] };
          const on = tryOn.wearing(wear);
          return (
            <Pressable
              key={preset.id}
              testID={`design-paint-${preset.id}`}
              accessibilityRole="button"
              accessibilityLabel={labels.theme(preset.id)}
              accessibilityState={{ selected: on }}
              aria-pressed={on}
              onPress={() => tryOn.toggle(wear, labels.theme(preset.id))}
              style={{
                width: on ? 136 : 72,
                alignItems: "center",
                justifyContent: "flex-end",
                paddingBottom: 8,
              }}
            >
              <Gradient from={preset.colours[0]} to={preset.colours[1]} />
              {on ? (
                <View
                  style={{
                    maxWidth: "92%",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                    backgroundColor: ART.ground,
                  }}
                >
                  <AText
                    size={12}
                    line={20}
                    weight="semibold"
                    color={ART.ink}
                    numberOfLines={1}
                  >
                    {labels.theme(preset.id)}
                  </AText>
                </View>
              ) : null}
              {on ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    start: 0,
                    end: 0,
                    borderWidth: 4,
                    borderColor: palette.focus,
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A mood: real cards thrown on a table (web MoodTile) */
function MoodTile({
  mood,
  onMood,
}: {
  mood: string;
  onMood?: (mood: string) => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const vibeText = useVibeText();
  const vibeLine = useVibeLine();
  const cast = useCast();
  const looks = (VIBES.find((vibe) => vibe.id === mood)?.looks ?? [])
    .slice(0, 3)
    .map((id) => LOOKS.find((look) => look.id === id)!);
  return (
    <PressScale
      testID={`design-mood-${mood}`}
      accessibilityRole="button"
      accessibilityLabel={t`${vibeText(mood)} collection`}
      scale={0.98}
      onPress={() => onMood?.(mood)}
      style={{
        flex: 1,
        justifyContent: "flex-end",
        alignItems: "flex-start",
        overflow: "hidden",
        padding: 20,
        borderRadius: 14,
        backgroundColor: palette.field,
      }}
    >
      <View
        pointerEvents="none"
        aria-hidden
        style={{
          position: "absolute",
          top: -24,
          end: "8%",
          width: 160,
          height: "100%",
        }}
      >
        {looks.map((look, i) => (
          <View
            key={look.id}
            style={{
              position: "absolute",
              top: 32,
              start: 0,
              width: 160,
              transform: [
                { rotate: i === 0 ? "-14deg" : i === 1 ? "12deg" : "0deg" },
              ],
            }}
          >
            <StyleCard style={look.style} person={cast[i + 4]} compact />
          </View>
        ))}
      </View>
      <AText size={40} line={48} weight="bold" color={palette.fg}>
        {vibeText(mood)}
      </AText>
      <AText
        size={13}
        line={20}
        color={palette.fg2}
        style={{ maxWidth: "50%", marginTop: 8 }}
      >
        {vibeLine(mood)}
      </AText>
    </PressScale>
  );
}

/** The wall while it is on its way: its own shapes, empty (web WallHolders) */
export function WallHolders() {
  const { window, width, onLayout } = useWallWidth();
  const shapes: Shape[] = [
    "holder-big",
    "holder",
    "holder",
    "holder-wide",
    "holder",
    "holder",
    "holder-wide",
    "holder",
  ];
  const grid = width
    ? packGrid(
        shapes.map((shape) => spanOf(shape, false, window)),
        columnsFor(window),
        width,
      )
    : undefined;
  return (
    <View
      testID="designs-holders"
      accessibilityState={{ busy: true }}
      onLayout={onLayout}
      style={{ height: grid?.height ?? 600 }}
    >
      {grid?.boxes.map((box, i) => (
        <View
          key={i}
          style={{ position: "absolute", start: box.x, top: box.y }}
        >
          <Holder width={box.width} height={box.height} />
        </View>
      ))}
    </View>
  );
}

/** Nothing on the wall, for a reason worth saying (web WallEmpty) */
export function WallEmpty({
  failed,
  waiting,
  onRetry,
  onClear,
}: {
  failed?: boolean;
  waiting?: boolean;
  onRetry: () => void;
  onClear: () => void;
}) {
  const { t } = useLingui();
  if (failed) return <LoadError onRetry={onRetry} />;
  if (waiting)
    return (
      <Notice
        art={<OpenRing />}
        title={t`The first design here could be yours`}
        action={{ label: t`Browse designs`, onPress: onClear }}
        testID="designs-waiting"
      >
        {t`Designs made by the community appear here as soon as a creator publishes one.`}
      </Notice>
    );
  return (
    <Notice
      icon="magnifying-glass"
      title={t`Nothing in the flock matches`}
      action={{
        label: t`Clear search`,
        onPress: onClear,
        testID: "designs-clear",
      }}
      testID="designs-nothing"
    >
      {t`Try another word, or a creator's name.`}
    </Notice>
  );
}
