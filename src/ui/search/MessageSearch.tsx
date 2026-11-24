import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import type { Channel } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, type TextInputInstance, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { inputDirStyle } from "@/ui/kit/bidi";
import { MessageRow } from "@/chat/MessageRow";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { fontFamily } from "@/theme/fonts";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";
import { HeaderButton } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { channelRoute } from "@/ui/forum/channelRoute";

import { EmptyState, Pill, TextButton } from "./parts";
import { searchResolver } from "./people";
import { removeFilter, type ResultRow, resultRows, type SearchScope, type SearchSort } from "./searchChoices";
import { SearchFilters } from "./SearchFilters";
import { useSearchLabels } from "./searchLabels";
import { type HasValue, parseSearch, toSearchRequest } from "./searchSyntax";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/** the field's border already shows focus: no browser ring inside it (the web preview) */
const NO_RING = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as object;

const noop = () => {};

/** A result: the message as in the chat, a tap opens it in its channel (web: Message isLink) */
const ResultMessage = memo(function ResultMessage({ id, channelId, selfId }: { id: string; channelId: string; selfId?: string }) {
  const { t } = useLingui();
  const client = useClient();
  return (
    <Pressable
      testID={`search-result-${id}`}
      accessibilityRole="link"
      accessibilityLabel={t`Jump to message`}
      onPress={() => {
        const channel = client.channels.get(channelId);
        router.push(channelRoute({ id: channelId, isThread: channel?.isThread }, id));
      }}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingBottom: 8, opacity: pressed ? 0.7 : 1 })}
    >
      {/* the row draws only; the tap is this link's */}
      <View pointerEvents="none">
        <MessageRow id={id} tail={false} selfId={selfId} onLongPress={noop} />
      </View>
    </Pressable>
  );
});

function GroupTitle({ channelId }: { channelId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(channelId);
  const name = useFields(channel, (c) => c.name ?? "");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
      <Icon name="hash" size={14} color={palette.fg2} />
      <AText autoDir size={13} line={18} weight="semibold" color={palette.fg2} numberOfLines={1}>
        {name || t`Unknown channel`}
      </AText>
    </View>
  );
}

type Results = { key: string; status: "loading" | "error" | "done"; ids: { id: string; channelId: string }[]; limited?: boolean };

/**
 * Message search on a phone (web: phone search bar + TextSearchSidebar): the
 * words and filters typed in the field (`from:`, `mentions:`, `has:`,
 * `before:`, `after:`, `during:`, `in:`, `pinned:`) or picked in the filter
 * sheet, in this channel or the whole server; the results grouped by channel,
 * a tap opens the message in its channel.
 */
export function MessageSearch({ channelId, initialQuery, initialScope }: { channelId: string; initialQuery?: string; initialScope?: SearchScope }) {
  const channel = useChannel(channelId);
  if (!channel) return null;
  return <SearchPage channel={channel} initialQuery={initialQuery ?? ""} initialScope={initialScope ?? "channel"} />;
}

function SearchPage({ channel, initialQuery, initialScope }: { channel: Channel; initialQuery: string; initialScope: SearchScope }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const labels = useSearchLabels();
  const [text, setText] = useState(initialQuery);
  /** what was sent: the field searches on Enter (web: SearchBox onCommit) */
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [sort, setSort] = useState<SearchSort>("Latest");
  const [filters, setFilters] = useState(false);
  /** the names last asked of the server, and how many lookups finished */
  const [lookup, setLookup] = useState({ key: "", done: 0 });
  const input = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);

  const inServer = !!channel.server;
  const parsed = useMemo(() => parseSearch(query), [query]);
  // lookups: members fetched since, so names resolve
  const request = useMemo(() => {
    void lookup.done;
    return toSearchRequest(parsed, searchResolver(channel, client));
  }, [parsed, channel, client, lookup.done]);

  // names this device has not loaded yet: ask the server before saying there
  // is nobody of that name (the answer fills the member cache)
  const unknownKey = channel.server
    ? request.problems
        .filter((p) => p.reason === "unknown-user")
        .map((p) => p.value)
        .join("")
    : "";
  const lookingUp = !!unknownKey && lookup.key !== unknownKey;
  useEffect(() => {
    if (!unknownKey || !channel.server) return;
    const server = channel.server;
    let alive = true;
    (async () => {
      for (const name of unknownKey.split("")) await server.queryMembersExperimental(name).catch(() => undefined);
      if (alive) setLookup((l) => ({ key: unknownKey, done: l.done + 1 }));
    })();
    return () => {
      alive = false;
    };
  }, [unknownKey, channel]);

  const problems = request.problems.filter((p) => !(p.reason === "unknown-user" && lookingUp));
  const effectiveScope: SearchScope = inServer && (request.serverWide || scope === "server") ? "server" : "channel";
  const ready = !request.empty && request.problems.length === 0 && !lookingUp;
  const key = ready ? JSON.stringify([channel.id, effectiveScope, request.params, sort]) : "";

  const [results, setResults] = useState<Results>({ key: "", status: "loading", ids: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const params = { ...request.params, sort };
    const run = effectiveScope === "server" ? channel.server!.searchMessagesWithUsers(params) : channel.searchWithUsers(params);
    run
      .then(({ messages }) => alive && setResults({ key, status: "done", ids: messages.map((m) => ({ id: m.id, channelId: m.channelId })) }))
      .catch((err: { status?: number }) => alive && setResults({ key, status: "error", ids: [], limited: err?.status === 429 }));
    return () => {
      alive = false;
    };
    // the key holds everything the search depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = results.key === key ? results : { key, status: "loading" as const, ids: [] };
  const rows: ResultRow[] = useMemo(() => (current.status === "done" ? resultRows(current.ids, effectiveScope === "server") : []), [current.status, current.ids, effectiveScope]);

  /** Chip text for a filter: localised key, readable value */
  const chip = (k: (typeof parsed.tokens)[number]["key"], value: string) => {
    let shown = value;
    if (k === "has") shown = labels.has(value.toLowerCase() as HasValue) ?? value;
    if (k === "pinned") shown = ["true", "yes", "1"].includes(value.toLowerCase()) ? labels.yes : labels.no;
    if (k === "in") shown = `#${value}`;
    return `${labels.key(k)}: ${shown}`;
  };
  const commit = (next: string) => {
    setText(next);
    setQuery(next);
  };
  const chosen = parsed.tokens.some((token) => token.value) || (inServer && scope === "server") || sort !== "Latest";
  const choiceChips: { key: string; label: string; remove: () => void }[] = [];
  if (inServer && scope === "server") choiceChips.push({ key: "scope", label: t`Whole server`, remove: () => setScope("channel") });
  if (sort !== "Latest") choiceChips.push({ key: "sort", label: sort === "Oldest" ? t`Oldest` : t`Relevance`, remove: () => setSort("Latest") });
  const tokenChips = parsed.tokens.filter((token) => token.value);

  const header = (
    <View style={{ gap: 8, paddingTop: 12, paddingBottom: 4 }}>
      {tokenChips.length || choiceChips.length ? (
        <View accessibilityLabel={t`Filters`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12 }}>
          {tokenChips.map((token) => {
            const label = chip(token.key, token.value);
            return (
              <Pill
                key={`${token.key}:${token.value}:${token.start}`}
                testID={`search-chip-${token.key}`}
                removable
                label={label}
                a11y={t`Remove filter: ${label}`}
                onPress={() => commit(removeFilter(query, token.key, token.value))}
              />
            );
          })}
          {choiceChips.map((item) => (
            <Pill key={item.key} testID={`search-chip-${item.key}`} removable label={item.label} a11y={t`Remove filter: ${item.label}`} onPress={item.remove} />
          ))}
        </View>
      ) : null}
      {problems.length ? (
        <View accessibilityRole="alert" style={{ alignItems: "center", gap: 8, paddingVertical: 24, paddingHorizontal: 16 }}>
          <Icon name="warning-circle" size={22} color={palette.iconNeutral} />
          {problems.map((p, i) => (
            <AText key={i} size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
              {labels.problem(p)}
            </AText>
          ))}
        </View>
      ) : null}
      {request.truncated ? (
        <AText size={12} line={16} color={palette.muted} style={{ textAlign: "center", paddingHorizontal: 12 }}>
          {t`Only the first 64 characters are searched.`}
        </AText>
      ) : null}
      {lookingUp || (ready && current.status === "loading") ? <ActivityIndicator color={palette.accent} style={{ marginTop: 24 }} /> : null}
    </View>
  );

  let empty = null;
  if (request.empty && !problems.length) {
    empty = <EmptyState testID="search-empty" icon="magnifying-glass" title={t`Search messages`} text={t`Type words, or choose filters with the button beside the field.`} />;
  } else if (ready && current.status === "error") {
    empty = (
      <View accessibilityRole="alert" style={{ alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 16 }}>
        <Icon name="warning-circle" size={22} color={palette.iconNeutral} />
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
          {current.limited ? t`Too many searches. Wait a moment, then try again.` : t`Search isn't available right now. Try again soon.`}
        </AText>
        <TextButton testID="search-retry" label={t`Try again`} onPress={() => setAttempt((n) => n + 1)} />
      </View>
    );
  } else if (ready && current.status === "done") {
    empty = (
      <View accessibilityRole="text" style={{ alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 16 }}>
        <Icon name="magnifying-glass" size={22} color={palette.iconNeutral} />
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
          {effectiveScope === "server" ? t`No messages in this server match your search.` : t`No messages in this channel match your search.`}
        </AText>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      {/* the search takes the whole header, with a way back (web: phone search bar) */}
      <View style={{ height: 64, paddingTop: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
        <HeaderButton testID="search-close" icon="arrow-left" label={t`Close search`} onPress={() => (router.canGoBack() ? router.back() : router.replace(channelRoute({ id: channel.id })))} />
        {/* the kit field: 44 px, radius 10, field border, accent while focused */}
        <View
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: RADIUS,
            borderWidth: 1,
            borderColor: focused ? palette.accent : palette.fieldBorder,
            backgroundColor: palette.field,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="magnifying-glass" size={20} color={palette.muted} />
          <TextInput
            ref={input}
            testID="search-input"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setQuery(text)}
            returnKeyType="search"
            autoFocus={!initialQuery}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder={t`Search messages`}
            accessibilityLabel={t`Search messages`}
            placeholderTextColor={palette.muted}
            selectionColor={palette.accent}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ flex: 1, minWidth: 0, minHeight: 44, marginVertical: -1, fontSize: 16, paddingVertical: 0, color: palette.fg, fontFamily: fontFamily(i18n.locale), ...NO_RING, ...inputDirStyle(text) }}
          />
          {text ? (
            <Pressable
              testID="search-clear"
              accessibilityRole="button"
              accessibilityLabel={t`Clear search`}
              onPress={() => {
                commit("");
                input.current?.focus();
              }}
              style={{ width: 44, height: 44, marginVertical: -1, marginEnd: -12, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="x" size={16} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          testID="search-filters-open"
          accessibilityRole="button"
          accessibilityLabel={t`Filter results`}
          accessibilityState={{ selected: chosen }}
          onPress={() => {
            // what is typed counts once the sheet opens
            setQuery(text);
            setFilters(true);
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: RADIUS,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? palette.navSelected : chosen ? palette.tonal : "transparent",
          })}
        >
          <Icon name="funnel" size={22} color={chosen ? palette.accentText : palette.fg2} />
        </Pressable>
      </View>

      <FlashList
        testID="search-results"
        data={rows}
        keyExtractor={(row) => (row.kind === "channel" ? `c-${row.channelId}` : row.id)}
        getItemType={(row) => row.kind}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        {...keyboardScrollProps}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => (item.kind === "channel" ? <GroupTitle channelId={item.channelId} /> : <ResultMessage id={item.id} channelId={item.channelId} selfId={selfId} />)}
      />

      <SearchFilters
        visible={filters}
        onClose={() => setFilters(false)}
        channel={channel}
        query={query}
        onQuery={commit}
        scope={scope}
        onScope={setScope}
        sort={sort}
        onSort={setSort}
      />
    </SafeAreaView>
  );
}
