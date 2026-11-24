/**
 * The gallery: one sky, one wall (web designs/Home.tsx DesignsHome). Every
 * design tries on with a tap and lands on you in the dock. With a filter, a
 * mood or a search the sky steps aside and the wall comes first. The kinds
 * are big words in a row that stays at the top; the order (Most worn /
 * Newest) sits at its far end.
 */
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText, Icon } from "@/ui/kit";
import { Segmented } from "@/ui/search/parts";

import type { WallFilter } from "./gallery";
import { useCommunity, useGalleryTiles, useKindLabels } from "./hooks";
import { useVibeText } from "./labels";
import { DesignsSky, Glow } from "./parts";
import { DesignsScreen } from "./Screen";
import { Wall, WallEmpty, WallHolders } from "./Wall";

const KINDS: WallFilter[] = [
  "all",
  "looks",
  "decorations",
  "nameplates",
  "effects",
  "frames",
  "colours",
  "name",
  "community",
];

/** A value that follows another after it has rested for `ms` */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function GalleryScreen({
  initialFilter = "all",
}: {
  initialFilter?: WallFilter;
}) {
  const [typed, setTyped] = useState("");
  const query = useSettled(typed.trim(), 300);
  const [filter, setFilter] = useState<WallFilter>(initialFilter);
  const [mood, setMood] = useState<string>();
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [version, setVersion] = useState(0);
  const community = useCommunity({ query, sort }, version);
  const tiles = useGalleryTiles({ filter, mood, query, community });
  // the wall waits for the first page from the server (its shapes show meanwhile)
  const [firstPage, setFirstPage] = useState(false);
  if (!firstPage && !community.loading) setFirstPage(true);
  const quiet = filter === "all" && !query && !mood;

  const clear = () => {
    setTyped("");
    setMood(undefined);
    setFilter("all");
  };

  return (
    <DesignsScreen
      testID="designs-gallery"
      chapter="gallery"
      search={{ value: typed, onChange: setTyped }}
      onRefresh={community.reload}
      onChanged={() => setVersion((v) => v + 1)}
      sticky={0}
      above={
        quiet ? (
          <FlockStage lit={Object.keys(community.creators).length + 1} />
        ) : undefined
      }
    >
      {(actions) => [
        <Kinds
          key="kinds"
          filter={filter}
          mood={mood}
          onFilter={(next) => {
            setMood(undefined);
            setFilter(next);
          }}
          onClearMood={() => setMood(undefined)}
          sort={
            community.items.length > 1
              ? { value: sort, onChange: setSort }
              : undefined
          }
        />,
        firstPage && tiles.length ? (
          <Wall
            key="wall"
            tiles={tiles}
            more={community.more}
            loading={community.loading}
            onMore={community.next}
            {...actions}
            onMood={(next) => {
              setMood(next);
              setFilter("all");
            }}
          />
        ) : community.loading ? (
          <WallHolders key="holders" />
        ) : (
          <WallEmpty
            key="empty"
            failed={community.failed}
            waiting={filter === "community" && !query}
            onRetry={community.retry}
            onClear={clear}
          />
        ),
      ]}
    </DesignsScreen>
  );
}

/** The top of the gallery: the flock, with the page's title on the lower part of the sky (web FlockStage) */
function FlockStage({ lit }: { lit: number }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View
      testID="designs-flock"
      accessibilityLabel={t`The flock`}
      style={{ height: 280, backgroundColor: palette.frame }}
    >
      <Glow height={280} />
      <DesignsSky lit={lit} />
      <View
        style={{ position: "absolute", bottom: 24, start: 16, end: 16, gap: 8 }}
      >
        <AText
          size={30}
          line={38}
          weight="bold"
          color={palette.header}
          accessibilityRole="header"
          style={{ maxWidth: 520 }}
        >
          {t`Pick a bird. Wear its colours.`}
        </AText>
        <AText
          size={15}
          line={24}
          color={palette.fg2}
          style={{ maxWidth: 480 }}
        >
          {t`Every bird in this flock is a design for your Zrzur profile. Tap one and it lands on you.`}
        </AText>
      </View>
    </View>
  );
}

/** The kinds as big words: the current one lit, the rest in the dark (web Kinds) */
function Kinds({
  filter,
  mood,
  onFilter,
  onClearMood,
  sort,
}: {
  filter: WallFilter;
  mood?: string;
  onFilter: (filter: WallFilter) => void;
  onClearMood: () => void;
  sort?: {
    value: "popular" | "new";
    onChange: (value: "popular" | "new") => void;
  };
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const labels = useKindLabels();
  const vibeText = useVibeText();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t`Kinds of designs`}
      style={{ marginHorizontal: -16, backgroundColor: palette.frame }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingVertical: 4,
        marginTop: 8,
        gap: 16,
        alignItems: "center",
        flexGrow: 1,
      }}
    >
      {KINDS.map((kind) => {
        const on = filter === kind && !mood;
        return (
          <Pressable
            key={kind}
            testID={`designs-kind-${kind}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            aria-current={on ? "true" : undefined}
            onPress={() => onFilter(kind)}
            style={({ pressed }) => ({
              minHeight: 44,
              minWidth: 44,
              justifyContent: "center",
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AText
              size={18}
              line={26}
              weight="bold"
              color={on ? palette.fg : palette.muted}
            >
              {labels[kind]}
            </AText>
          </Pressable>
        );
      })}
      {mood ? (
        <Pressable
          testID="designs-mood-clear"
          accessibilityRole="button"
          accessibilityLabel={t`Remove filter ${vibeText(mood)}`}
          onPress={onClearMood}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AText size={18} line={26} weight="bold" color={palette.fg}>
            {vibeText(mood)}
          </AText>
          <Icon name="x" size={16} color={palette.fg} />
        </Pressable>
      ) : null}
      {sort ? (
        <View style={{ marginStart: "auto", width: 220 }}>
          <Segmented
            label={t`Sort`}
            value={sort.value}
            onChange={sort.onChange}
            testID="designs-sort"
            options={[
              { value: "popular", label: t`Most worn` },
              { value: "new", label: t`Newest` },
            ]}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
