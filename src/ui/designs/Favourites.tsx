/**
 * The designs you saved (web Designs.tsx Favourites, with the stage's quiet
 * title): a heart on any design keeps it here; only you see this list.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/kit";

import { useCommunity, useCommunityTiles } from "./hooks";
import { LoadError, Notice, StyleCard, WornAvatar, useMe } from "./parts";
import { DesignsScreen } from "./Screen";
import { DECORATIONS } from "./style";
import { Wall, WallHolders } from "./Wall";

/** Real designs on sample avatars, for a list with nothing of its own yet (web Samples "saved") */
function Samples() {
  return (
    <View
      aria-hidden
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
      }}
    >
      {[DECORATIONS[0], DECORATIONS[4], DECORATIONS[6]].map((decoration, i) => (
        <WornAvatar
          key={decoration}
          size={64}
          style={{ decoration }}
          other={{ name: "", colour: "#171925", face: [0, 3, 6][i] }}
        />
      ))}
    </View>
  );
}

export function FavouritesScreen() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const me = useMe();
  // your card beside the title only on a wide screen, as on the web
  const wide = useWindowDimensions().width >= 900;
  const [version, setVersion] = useState(0);
  const community = useCommunity({ favourites: true }, version);
  const toTiles = useCommunityTiles();
  const tiles = useMemo(
    () =>
      toTiles(community.items, community.creators).map((tile, i) => ({
        ...tile,
        big: i % 5 === 0,
      })),
    [toTiles, community.items, community.creators],
  );

  return (
    <DesignsScreen
      testID="designs-favourites"
      chapter="favourites"
      onRefresh={community.reload}
      onChanged={() => setVersion((v) => v + 1)}
    >
      {(actions) => [
        <View key="hero" style={{ paddingTop: 24, paddingBottom: 8, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <AText
              size={28}
              line={36}
              weight="bold"
              color={palette.header}
              accessibilityRole="header"
            >
              {t`Your saved designs`}
            </AText>
            <AText size={15} line={24} color={palette.fg2}>
              {t`Tap the heart on any design to keep it here. Only you see this list.`}
            </AText>
          </View>
          {me && wide ? <StyleCard style={me.style} /> : null}
        </View>,
        community.loading && !tiles.length ? (
          <WallHolders key="holders" />
        ) : community.failed ? (
          <LoadError key="error" onRetry={community.retry} />
        ) : !tiles.length ? (
          <Notice
            key="empty"
            art={<Samples />}
            title={t`No favourites yet`}
            action={{
              label: t`Browse designs`,
              onPress: () => router.replace("/designs" as never),
              filled: true,
              testID: "designs-browse",
            }}
            testID="designs-favourites-empty"
          >
            {t`Tap the heart on a design to save it here.`}
          </Notice>
        ) : (
          <View key="wall" style={{ paddingTop: 16 }}>
            <Wall
              tiles={tiles}
              more={community.more}
              loading={community.loading}
              onMore={community.next}
              {...actions}
              testID="designs-favourites-wall"
            />
          </View>
        ),
      ]}
    </DesignsScreen>
  );
}
