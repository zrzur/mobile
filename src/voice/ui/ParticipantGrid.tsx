import { useLingui } from "@lingui/react/macro";
import { memo } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { UserAvatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { PressScale } from "@/ui/kit/Press";

import { call, callStore, type Tile } from "../call";
import { CALL_EDGE, PHONE_MAX_WIDTH, phoneTiles, TILE_GAP, type TileBox, tileTint } from "../layout";
import { gridColumns, tileOrder } from "../logic";
import { voiceRuntime } from "../native";
import { useStore } from "../store";

/** Tile sizes: the phone layout below 600 px, an even grid on a tablet */
function tileBoxes(count: number, width: number): TileBox[] {
  if (width < PHONE_MAX_WIDTH) return phoneTiles(count, width);
  const columns = gridColumns(count, width);
  const inner = Math.min(width, 960) - CALL_EDGE * 2;
  const size = Math.floor((inner - TILE_GAP * (columns - 1)) / columns);
  const height = columns === 1 ? Math.min(size, 420) : Math.floor(size * 0.9);
  return Array.from({ length: count }, () => ({ width: size, height }));
}

/**
 * Everyone in the call as tiles (web: callCard/ParticipantTile with the
 * phone call layout of phoneCall.css): each person on their own steady
 * tint, the first one across and the rest two side by side; a camera fills
 * its tile, a shared screen keeps its bars. Each tile reads only its own
 * speaking flag, so audio levels never re-render the grid.
 */
export function ParticipantGrid({ selfId, onOpen }: { selfId: string | undefined; onOpen?: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const tiles = useStore(callStore, (s) => s.tiles);
  const status = useStore(callStore, (s) => s.status);
  // before the room is joined: you alone, so the screen is never empty
  const list: Tile[] = tiles.length ? tiles : selfId ? [{ id: selfId, local: true, camera: false, screen: false, micMuted: false }] : [];
  const byId = new Map(list.map((tile) => [tile.id, tile]));
  const order = tileOrder(
    list.map((tile) => tile.id),
    selfId,
  );
  const boxes = tileBoxes(order.length, width);

  return (
    <ScrollView
      testID="voice-grid"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: CALL_EDGE, paddingVertical: 4, flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, justifyContent: "center", alignContent: "center" }}
    >
      {order.map((id, index) => {
        const tile = byId.get(id)!;
        return <ParticipantTile key={id} tile={tile} box={boxes[index]} connecting={status !== "connected"} onOpen={onOpen} />;
      })}
    </ScrollView>
  );
}

const ParticipantTile = memo(function ParticipantTile({ tile, box, connecting, onOpen }: { tile: Tile; box: TileBox; connecting: boolean; onOpen?: (id: string) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const user = client.users.get(tile.id);
  const name = useFields(user, (u) => u.displayName ?? u.username) ?? "";
  const speaking = useStore(callStore, (s) => s.speaking.includes(tile.id));
  const facing = useStore(callStore, (s) => s.facing);
  const runtime = voiceRuntime();
  const VideoView = runtime?.rn.VideoView;
  const source = tile.screen ? "screen" : tile.camera ? "camera" : undefined;
  const track = source ? call.videoTrack(tile.id, source) : undefined;
  // web: the avatar is 30 % of the tile's height, 48 to 112 px
  const avatar = Math.round(Math.min(112, Math.max(48, box.height * 0.3)));
  const pressable = !!onOpen && !tile.local;
  const label = tile.local ? `${name} (${t`You`})` : name;

  return (
    <View style={{ width: box.width, height: box.height }}>
      {/* speaking: a 2 px ring in the online colour and a soft 3 px halo (web outline + box-shadow) */}
      {speaking ? <View pointerEvents="none" style={{ position: "absolute", top: -3, bottom: -3, start: -3, end: -3, borderRadius: 23, borderWidth: 3, borderColor: `${palette.online}40` }} /> : null}
      <PressScale
        testID={`voice-tile-${tile.id}`}
        accessibilityRole={pressable ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityState={{ selected: speaking }}
        disabled={!pressable}
        scale={0.98}
        onPress={() => onOpen?.(tile.id)}
        style={{
          flex: 1,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: tileTint(tile.id),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, alignItems: "center", justifyContent: "center", opacity: connecting && tile.local ? 0.7 : 1 }}>
          {VideoView && track ? (
            <VideoView
              videoTrack={track}
              objectFit={tile.screen ? "contain" : "cover"}
              mirror={tile.local && tile.camera && !tile.screen && facing === "user"}
              style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }}
            />
          ) : (
            <UserAvatar user={user} size={avatar} />
          )}
        </View>
        {speaking ? <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, borderRadius: 20, borderWidth: 2, borderColor: palette.online }} /> : null}
        <View pointerEvents="none" style={{ position: "absolute", start: 10, bottom: 10, end: tile.local && tile.camera ? 60 : 10, flexDirection: "row" }}>
          <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.overlayScrim }}>
            <AText autoDir size={13} line={18} weight="semibold" color={palette.onOverlay} numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </AText>
            {tile.weak ? (
              <View accessible accessibilityRole="image" accessibilityLabel={tile.weak === "lost" ? t`Connection lost` : t`Weak connection`}>
                <Icon name={tile.weak === "lost" ? "wifi-slash" : "warning"} size={16} color={palette.warningText} />
              </View>
            ) : null}
            {tile.screen ? <Icon name="monitor-arrow-up" size={16} color={palette.onOverlay} /> : null}
            {tile.micMuted ? <Icon name="microphone-slash" size={16} color={palette.danger} /> : null}
          </View>
        </View>
      </PressScale>
      {tile.local && tile.camera ? (
        <PressScale
          testID="voice-flip-camera"
          accessibilityRole="button"
          accessibilityLabel={t`Flip camera`}
          onPress={() => void call.flipCamera()}
          scale={0.94}
          style={({ pressed }) => ({
            position: "absolute",
            end: 6,
            bottom: 6,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? palette.overlayScrimPressed : palette.overlayScrim,
          })}
        >
          <Icon name="arrows-clockwise" size={20} color={palette.onOverlay} />
        </PressScale>
      ) : null}
    </View>
  );
});
