import { Trans, useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";
import { SearchField } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";

import { emojiCategories, type EmojiCategoryId, searchEmoji, type SkinTone, withSkinTone } from "./data";
import { type EmojiEntry, entryKey, noteUsed, setSkinTone, toggleFavourite, useEmojiPrefs } from "./prefs";
import { haptics } from "@/ui/kit/haptics";

export type { EmojiEntry } from "./prefs";

const CELL = 44;
const HEADING = 36;
const SEARCH_LIMIT = 120;
const TONES: SkinTone[] = [0, 1, 2, 3, 4, 5];

type Row =
  | { kind: "heading"; key: string; title: string; serverId?: string; section: string }
  | { kind: "tip"; key: string }
  | { kind: "cells"; key: string; entries: EmojiEntry[] };

const CATEGORY_ICON: Record<EmojiCategoryId, IconName> = {
  people: "smiley",
  nature: "leaf",
  food: "cake",
  travel: "compass",
  activities: "game-controller",
  objects: "gift",
  symbols: "heart",
  flags: "flag",
};

/** What a pick puts in a message: the emoji itself, or `:id:` for a custom one */
export function entryText(entry: EmojiEntry) {
  return entry.kind === "custom" ? `:${entry.id}:` : entry.text;
}

/** What a reaction stores: the emoji itself, or the custom emoji's id */
export function entryReaction(entry: EmojiEntry) {
  return entry.kind === "custom" ? entry.id : entry.text;
}

const Cell = memo(function Cell({ entry, cdn, onPick, onHold }: { entry: EmojiEntry; cdn?: string; onPick: (e: EmojiEntry) => void; onHold: (e: EmojiEntry) => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.name}
      onPress={() => onPick(entry)}
      onLongPress={() => onHold(entry)}
      delayLongPress={350}
      style={({ pressed }) => ({ width: CELL, height: CELL, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      {entry.kind === "custom" ? (
        <Image source={{ uri: cdn ? `${cdn.replace(/\/$/, "")}/emojis/${entry.id}` : undefined }} style={{ width: 30, height: 30 }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={entry.id} />
      ) : (
        <Text style={{ fontSize: 28, lineHeight: 34 }} allowFontScaling={false}>
          {entry.text}
        </Text>
      )}
    </Pressable>
  );
});

function chunk(list: EmojiEntry[], columns: number, key: string): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < list.length; i += columns) rows.push({ kind: "cells", key: `${key}-${i}`, entries: list.slice(i, i + columns) });
  return rows;
}

/**
 * The emoji picker (web: composition/picker/EmojiPicker): search, recent,
 * favourites (hold an emoji to add it), each server's custom emoji, then
 * every standard emoji by category, with a skin tone for people and
 * hands. One virtualised list, so it opens at once on weak phones.
 */
export function EmojiPicker({ visible, onClose, onPick, testID = "emoji-picker" }: { visible: boolean; onClose: () => void; onPick: (entry: EmojiEntry) => void; testID?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const prefs = useEmojiPrefs();
  const [query, setQuery] = useState("");
  const [tones, setTones] = useState(false);
  const list = useRef<FlashListRef<Row>>(null);
  const cdn = client.configuration?.features?.autumn?.url;
  const columns = Math.max(6, Math.floor((Math.min(width, 640) - 24) / CELL));

  // servers that have custom emoji: "id\u0001name" so the list only changes when they do
  const serverKey = useSolid(
    useCallback(
      () =>
        client.servers
          .toList()
          .filter((s) => s.emojis.length > 0)
          .map((s) => `${s.id}\u0001${s.name}\u0001${s.emojis.length}`)
          .join("\u0002"),
      [client],
    ),
  );

  const categoryTitle = useCallback(
    (id: EmojiCategoryId) =>
      ({
        people: t`Smileys & people`,
        nature: t`Animals & nature`,
        food: t`Food & drink`,
        travel: t`Travel & places`,
        activities: t`Activities`,
        objects: t`Objects`,
        symbols: t`Symbols`,
        flags: t`Flags`,
      })[id],
    [t],
  );

  const servers = useMemo(
    () =>
      (serverKey ? serverKey.split("\u0002") : []).map((s) => {
        const [id, name] = s.split("\u0001");
        return { id, name };
      }),
    [serverKey],
  );

  const tone = prefs.tone;
  const rows = useMemo(() => {
    if (!visible) return [] as Row[];
    const out: Row[] = [];
    if (prefs.recent.length) {
      out.push({ kind: "heading", key: "h-recent", title: t`Recent`, section: "recent" });
      out.push(...chunk(prefs.recent, columns, "recent"));
    }
    out.push({ kind: "heading", key: "h-fav", title: t`Favorites`, section: "favourites" });
    if (prefs.favourites.length) out.push(...chunk(prefs.favourites, columns, "fav"));
    else out.push({ kind: "tip", key: "tip" });
    for (const s of servers) {
      const server = client.servers.get(s.id);
      if (!server) continue;
      out.push({ kind: "heading", key: `h-${s.id}`, title: s.name, serverId: s.id, section: `s:${s.id}` });
      out.push(...chunk(server.emojis.map((e) => ({ kind: "custom" as const, id: e.id, name: e.name })), columns, s.id));
    }
    for (const c of emojiCategories()) {
      out.push({ kind: "heading", key: `h-${c.id}`, title: categoryTitle(c.id), section: c.id });
      out.push(...chunk(c.emoji.map((d) => ({ kind: "unicode" as const, text: withSkinTone(d.emoji, tone), name: d.shorthands[0] })), columns, c.id));
    }
    return out;
  }, [visible, prefs.recent, prefs.favourites, servers, columns, tone, client, t, categoryTitle]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const found: EmojiEntry[] = [];
    for (const s of servers) {
      for (const e of client.servers.get(s.id)?.emojis ?? []) {
        if (found.length >= SEARCH_LIMIT) break;
        if (e.name.toLowerCase().includes(needle)) found.push({ kind: "custom", id: e.id, name: e.name });
      }
    }
    for (const d of searchEmoji(needle, SEARCH_LIMIT - found.length)) found.push({ kind: "unicode", text: withSkinTone(d.emoji, tone), name: d.shorthands[0] });
    return chunk(found, columns, "q");
  }, [query, servers, client, columns, tone]);

  const pick = useCallback(
    (entry: EmojiEntry) => {
      noteUsed(entry);
      onPick(entry);
    },
    [onPick],
  );

  const hold = useCallback((entry: EmojiEntry) => {
    toggleFavourite(entry);
    haptics.selection();
  }, []);

  const tabs: { section: string; icon?: IconName; serverId?: string; label: string }[] = [
    ...(prefs.recent.length ? [{ section: "recent", icon: "clock" as IconName, label: t`Recent` }] : []),
    { section: "favourites", icon: "star", label: t`Favorites` },
    ...servers.map((s) => ({ section: `s:${s.id}`, serverId: s.id, label: s.name })),
    ...emojiCategories().map((c) => ({ section: c.id, icon: CATEGORY_ICON[c.id], label: categoryTitle(c.id) })),
  ];

  const jump = (section: string) => {
    const index = rows.findIndex((r) => r.kind === "heading" && r.section === section);
    if (index >= 0) list.current?.scrollToIndex({ index, animated: false });
  };

  const close = () => {
    setQuery("");
    setTones(false);
    onClose();
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "heading") {
      return (
        <View style={{ height: HEADING, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          {item.serverId ? <ServerIcon id={item.serverId} name={item.title} /> : null}
          <AText size={12} line={16} weight="semibold" color={palette.muted} numberOfLines={1} style={{ flex: 1, textTransform: "uppercase" }}>
            {item.title}
          </AText>
        </View>
      );
    }
    if (item.kind === "tip") {
      return (
        <AText size={13} line={18} color={palette.muted} style={{ paddingHorizontal: 4, paddingVertical: 8 }}>
          <Trans>Tip: hold any emoji to add it to your favorites.</Trans>
        </AText>
      );
    }
    return (
      <View style={{ flexDirection: "row" }}>
        {item.entries.map((e) => (
          <Cell key={entryKey(e)} entry={e} cdn={cdn} onPick={pick} onHold={hold} />
        ))}
      </View>
    );
  };

  const data = results ?? rows;

  return (
    <SheetModal visible={visible} onClose={close} testID={testID} handleOnly panelStyle={{ height: Math.min(height * 0.72, 560) + insets.bottom, paddingTop: 12 }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginBottom: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
            <SearchField value={query} onChange={setQuery} placeholder={t`Find the perfect emoji`} testID="emoji-search" />
            <Pressable
              testID="emoji-skin-tone"
              accessibilityRole="button"
              accessibilityLabel={t`Skin tone`}
              accessibilityState={{ expanded: tones }}
              onPress={() => setTones((v) => !v)}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed || tones ? palette.navSelected : palette.field })}
            >
              <Text style={{ fontSize: 22 }}>{withSkinTone("✋", tone)}</Text>
            </Pressable>
          </View>
          {tones ? (
            <View accessibilityRole="radiogroup" accessibilityLabel={t`Skin tone`} style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4, paddingHorizontal: 12, paddingTop: 8 }}>
              {TONES.map((tn) => (
                <Pressable
                  key={tn}
                  testID={`emoji-tone-${tn}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: tn === tone }}
                  aria-checked={tn === tone}
                  accessibilityLabel={tn === 0 ? t`Default` : `${tn}`}
                  onPress={() => {
                    setSkinTone(tn);
                    setTones(false);
                  }}
                  style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: tn === tone ? palette.accent : "transparent" }}
                >
                  <Text style={{ fontSize: 22 }}>{withSkinTone("✋", tn)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {!results ? (
            <FlashList
              horizontal
              data={tabs}
              keyExtractor={(tab) => tab.section}
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, maxHeight: 52 }}
              contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}
              renderItem={({ item: tab }) => (
                <Pressable
                  testID={`emoji-tab-${tab.section}`}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  onPress={() => jump(tab.section)}
                  style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
                >
                  {tab.serverId ? <ServerIcon id={tab.serverId} name={tab.label} /> : <Icon name={tab.icon!} size={22} color={palette.iconMuted} />}
                </Pressable>
              )}
            />
          ) : null}
          <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
            {results && results.length === 0 ? (
              <View accessibilityRole="text" style={{ alignItems: "center", paddingVertical: 32, gap: 4 }}>
                <AText size={15} line={20} weight="semibold" color={palette.fg}>
                  <Trans>No emoji found</Trans>
                </AText>
                <AText size={14} line={20} color={palette.muted}>
                  <Trans>Try another search.</Trans>
                </AText>
              </View>
            ) : (
              <FlashList
                ref={list}
                testID="emoji-grid"
                data={data}
                keyExtractor={(r) => r.key}
                getItemType={(r) => r.kind}
                renderItem={renderRow}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
              />
            )}
          </View>
    </SheetModal>
  );
}

function ServerIcon({ id, name }: { id: string; name: string }) {
  const client = useClient();
  const url = useSolid(useCallback(() => client.servers.get(id)?.iconURL, [client, id]));
  return <Avatar url={url} name={name} size={22} square />;
}
