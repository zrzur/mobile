import { useLingui } from "@lingui/react/macro";
import type { Channel, Server } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type HostInstance, Pressable, View } from "react-native";
import Animated, { useAnimatedRef, useAnimatedScrollHandler } from "react-native-reanimated";

import { useWide } from "./useWide";

import { useClient } from "@/client/ClientProvider";
import { useChannel, useConversationIds, useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { ServerSheet } from "@/ui/server/ServerSheet";
import { buzz } from "@/ui/kit/haptics";
import { PressScale } from "@/ui/kit/Press";
import { serverHomeRoute } from "@/ui/server/home";
import { FolderGhost, FolderTile, useRailEntries } from "@/ui/server/RailFolders";
import { RailDraggable, RailDragProvider, RailDropIndicator, RailGhost, useRailA11y, useRailDrag, useRailDragController } from "@/ui/server/RailDrag";
import { applyFold, applyMove, orderingValue, type RailIntent, railItems } from "@/ui/server/railReorder";
import { saveSynced, syncedNow } from "@/ui/server/syncedStore";
import { cleanFolders, type RailEntry } from "@/ui/server/syncedLogic";
import { newUlid } from "@/ui/server/ulid";

import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { ChromeScale } from "../kit/fontScale";
import { AText } from "../kit/Text";
import { Logo } from "../Logo";

/** Mentions in a server's channels that are not muted */
export function serverMentions(server: Server): number {
  let count = 0;
  for (const channel of server.channels) {
    if (!channel.muted) count += channel.mentions?.size ?? 0;
  }
  return count;
}

/** The 3 px bar on the inline-start edge: 8 tall unread, 32 tall selected */
function StateBar({ state }: { state: "selected" | "unread" | null }) {
  const { palette } = useTheme();
  if (!state) return null;
  return (
    <View
      style={{
        position: "absolute",
        start: -9,
        top: "50%",
        width: 3,
        height: state === "selected" ? 32 : 8,
        marginTop: state === "selected" ? -16 : -4,
        borderTopEndRadius: 4,
        borderBottomEndRadius: 4,
        backgroundColor: state === "selected" ? palette.accent : palette.unread,
      }}
    />
  );
}

/** The mention count dot at the top end of a rail tile */
function MentionDot({ count }: { count: number }) {
  const { palette } = useTheme();
  if (count <= 0) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: -2,
        end: -2,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        backgroundColor: palette.mentionBadge,
        borderWidth: 2,
        borderColor: palette.frame,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count < 10 ? (
        // a fixed 16 px dot: the digit stops growing at 1.2×
        <AText size={10} line={12} weight="bold" color={palette.onAccent} maxFontSizeMultiplier={1.2}>
          {String(count)}
        </AText>
      ) : (
        <Icon name="plus" size={10} color={palette.onAccent} />
      )}
    </View>
  );
}

/** The white unread dot at the top end of a rail tile (no mentions) */
function UnreadDot() {
  const { palette } = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        end: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: palette.unread,
        borderWidth: 2,
        borderColor: palette.frame,
      }}
    />
  );
}

const ServerTile = memo(function ServerTile({ id, selected }: { id: string; selected: boolean }) {
  const server = useServer(id);
  const [menu, setMenu] = useState(false);
  const drag = useRailDrag();
  // tablets open a server with a lobby on the lobby, beside its channels
  const wide = useWide();
  const fields = useFields(server, (s) => ({
    name: s.name,
    icon: s.iconURL,
    unread: s.unread,
    mentions: serverMentions(s),
  }));
  const openMenu = useCallback(() => setMenu(true), []);
  const a11y = useRailA11y(id, openMenu);
  const name = fields?.name ?? "";
  const label = useCallback(() => name, [name]);
  if (!fields) return null;
  return (
    <>
      {/* a resting finger lifts the icon to drag it; resting longer, or letting go, opens the menu */}
      <RailDraggable id={id} label={label} onMenu={openMenu}>
        <PressScale
          testID={`rail-server-${id}`}
          haptic={selected ? undefined : "selection"}
          scale={0.94}
          {...a11y}
          accessibilityRole="button"
          accessibilityLabel={fields.name}
          accessibilityState={{ selected }}
          onPress={() => {
            if (drag && !drag.tapAllowed()) return;
            router.replace({ pathname: "/server/[id]", params: { id } });
            const home = wide ? serverHomeRoute(server) : undefined;
            if (home) router.push(home);
          }}
          style={{ width: 54, height: 48, alignItems: "center", justifyContent: "center" }}
        >
          <StateBar state={selected ? "selected" : fields.unread ? "unread" : null} />
          <Avatar url={fields.icon} name={fields.name} size={48} square />
          <MentionDot count={fields.mentions} />
        </PressScale>
      </RailDraggable>
      {menu ? <ServerSheet serverId={id} visible onClose={() => setMenu(false)} /> : null}
    </>
  );
});

/** The server icon carried under the finger while dragging */
function ServerGhost({ id }: { id: string }) {
  const server = useServer(id);
  const fields = useFields(server, (s) => ({ name: s.name, icon: s.iconURL }));
  if (!fields) return null;
  return <Avatar url={fields.icon} name={fields.name} size={48} square />;
}

const ConversationTile = memo(function ConversationTile({ id }: { id: string }) {
  const channel = useChannel(id);
  const fields = useFields(channel, (c: Channel) => ({
    name: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : c.name,
    icon: c.iconURL ?? c.recipient?.avatarURL,
    mentions: c.mentions?.size ?? 0,
    // a person is round on the rail (web), a group keeps the rounded square
    dm: c.type === "DirectMessage",
  }));
  if (!fields) return null;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={fields.name}
      scale={0.94}
      onPress={() => router.push({ pathname: "/channel/[id]", params: { id } })}
      style={{
        width: 54,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StateBar state="unread" />
      <Avatar url={fields.icon} name={fields.name} size={48} square={!fields.dm} />
      {fields.mentions > 0 ? <MentionDot count={fields.mentions} /> : <UnreadDot />}
    </PressScale>
  );
});

/** Up to nine conversations with something new, above the servers */
function useUnreadConversationIds() {
  const client = useClient();
  const ids = useConversationIds();
  const pick = useCallback(() => ids.filter((id) => client.channels.get(id)?.unread && !client.channels.get(id)?.muted).slice(0, 9), [client, ids]);
  return useFields(ids, pick, [ids.join(",")]) ?? [];
}

/** Write a drop to the synced folders and order, as the web does (folders first) */
function useRailDrop(entries: RailEntry[]) {
  const { t } = useLingui();
  const client = useClient();
  return useCallback(
    (held: string, intent: RailIntent) => {
      const folders = cleanFolders(syncedNow("server-folders"));
      const change =
        intent.type === "fold"
          ? applyFold(entries, folders, intent.target, held, `folder-${newUlid(Date.now(), Math.random)}`, t`New folder`)
          : applyMove(entries, folders, held, intent.before, intent.parent);
      if (!change) return;
      const run = async () => {
        if (JSON.stringify(change.folders) !== JSON.stringify(folders)) await saveSynced(client, "server-folders", { folders: change.folders });
        await saveSynced(client, "ordering", orderingValue(syncedNow("ordering"), change.order));
      };
      // a refused save puts the rail back by itself (syncedStore)
      run().catch(() => buzz("error"));
    },
    [client, entries, t],
  );
}

/** The server rail on the menu side (72 px) */
export function Rail({ selected }: { selected?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const entries = useRailEntries();
  const unreadConversations = useUnreadConversationIds();
  const items = useMemo(() => railItems(entries), [entries]);
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const content = useRef<HostInstance>(null);
  const onDrop = useRailDrop(entries);
  const drag = useRailDragController({ items, content, scroll, onDrop });
  const { scrollY, frame } = drag;
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const ghostEntry = drag.ghost ? entries.find((e) => e.id === drag.ghost) : undefined;
  return (
    <ChromeScale>
      <RailDragProvider value={drag}>
        <View style={{ width: 72, height: "100%", backgroundColor: palette.frame }}>
          <Animated.ScrollView
            ref={scroll}
            testID="rail"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!drag.locked}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={(_w, h) => frame.set({ ...frame.get(), content: h })}
          >
            <View ref={content} collapsable={false} style={{ alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 96 }}>
              <Pressable
                testID="rail-home"
                accessibilityRole="button"
                accessibilityLabel={t`Home`}
                accessibilityState={{ selected: !selected }}
                onPress={() => router.replace("/home")}
                style={{ width: 54, height: 48, alignItems: "center", justifyContent: "center" }}
              >
                <StateBar state={!selected ? "selected" : null} />
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: !selected ? palette.field : "transparent",
                    opacity: !selected ? 1 : 0.9,
                  }}
                >
                  <Logo size={44} color={palette.mark} />
                </View>
              </Pressable>
              {unreadConversations.map((id) => (
                <ConversationTile key={id} id={id} />
              ))}
              <View style={{ width: 24, height: 1, backgroundColor: palette.borderStrong, marginVertical: 4 }} />
              {entries.map((entry) =>
                entry.type === "server" ? (
                  <ServerTile key={entry.id} id={entry.id} selected={selected === entry.id} />
                ) : (
                  <FolderTile
                    key={entry.id}
                    folder={entry.folder}
                    servers={entry.servers}
                    selected={selected}
                    renderServer={(id) => <ServerTile key={id} id={id} selected={selected === id} />}
                  />
                ),
              )}
              <Pressable
                testID="rail-add-server"
                accessibilityRole="button"
                accessibilityLabel={t`Create or join a server`}
                onPress={() => router.push("/add-server")}
                style={({ pressed }) => ({
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? palette.navSelected : "transparent",
                })}
              >
                <Icon name="plus" size={24} color={palette.iconNeutral} />
              </Pressable>
              <RailDropIndicator />
            </View>
          </Animated.ScrollView>
          <RailGhost>
            {ghostEntry?.type === "folder" ? <FolderGhost folder={ghostEntry.folder} servers={ghostEntry.servers} /> : drag.ghost ? <ServerGhost id={drag.ghost} /> : null}
          </RailGhost>
        </View>
      </RailDragProvider>
    </ChromeScale>
  );
}
