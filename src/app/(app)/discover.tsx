import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { router } from "expo-router";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { toAuthError } from "@/auth/flow";
import { errorDetails, errorText } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useServerIds } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { PhoneTabs } from "@/ui/app/PhoneTabs";
import { YouSheet } from "@/ui/app/YouSheet";
import { ErrorBox } from "@/ui/auth/parts";
import { discoverApi } from "@/ui/discover/api";
import { BotDetail } from "@/ui/discover/BotDetail";
import { CardSkeletons, ListingCard, SectionHead } from "@/ui/discover/Cards";
import { useDiscoverLabels } from "@/ui/discover/labels";
import { CATEGORIES, type DiscoverKind, type DiscoverQuery, type Listing, PAGE_SIZE, browsePage, findLocal, fromBot, fromServer, mergeResults } from "@/ui/discover/logic";
import { type IconName } from "@/ui/Icon";
import { useCdn } from "@/ui/invite/media";
import { AText, Button, Chip, HeaderButton, Icon, SearchField, openExternal, usePullRefresh, useScrollToTop } from "@/ui/kit";
import { ReportSheet, type ReportSpec } from "@/ui/profile/ReportFlow";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

type Filters = { q?: string; category?: string; tag?: string; sort: "popular" | "new"; all?: boolean };
type Row = { key: string; kind: "card"; listing: Listing } | { key: string; kind: "head"; icon: IconName; title: string; onMore?: () => void } | { key: string; kind: "skeleton" };

const WEBSITE = "https://zrzur.com";
const APP = "https://app.zrzur.com";

/**
 * Discover (web: src/interface/Discover.tsx at phone width): Servers and
 * Bots, a search that answers on the keystroke, topics as chips, the
 * headline and paid top row (each marked "Ad"), hand-picked, then all;
 * results with Popular / New and Load more. A server opens its own page, a
 * bot opens its details as a sheet.
 */
export default function Discover() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const cdn = useCdn();
  const joined = useServerIds();
  const labels = useDiscoverLabels();

  const [kind, setKind] = useState<DiscoverKind>("servers");
  const [filters, setFilters] = useState<Filters>({ sort: "popular" });
  const [typed, setTyped] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const [featured, setFeatured] = useState<Listing[]>([]);
  const [popular, setPopular] = useState<Listing[]>([]);
  const [fresh, setFresh] = useState<Listing[]>([]);
  const [topRow, setTopRow] = useState<Listing[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [answered, setAnswered] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<ReturnType<typeof toAuthError> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [joinError, setJoinError] = useState<ReturnType<typeof toAuthError> | null>(null);
  const [bot, setBot] = useState<Listing | null>(null);
  const [report, setReport] = useState<ReportSpec | null>(null);
  const [you, setYou] = useState(false);
  const listRef = useRef<FlashListRef<Row>>(null);
  const token = useRef(0);
  useScrollToTop("discover", listRef);

  const browsing = !filters.all && !filters.q && !filters.category && !filters.tag;
  const typing = !!typed.trim();
  const showResults = !browsing || typing;

  const fetchListings = useCallback(
    async (k: DiscoverKind, query: DiscoverQuery) =>
      k === "servers" ? (await discoverApi.servers(client, query)).map(fromServer) : (await discoverApi.bots(client, query)).map(fromBot),
    [client],
  );

  /** Load the page for the current tab and filters; stale answers are dropped */
  const load = useCallback(
    async (reset = true) => {
      const current = ++token.current;
      setLoading(true);
      setFailed(null);
      try {
        if (!filters.all && !filters.q && !filters.category && !filters.tag) {
          const [f, p, n, row] = await Promise.all([
            fetchListings(kind, { featured: true, limit: 6 }),
            fetchListings(kind, { sort: "popular", limit: PAGE_SIZE }),
            fetchListings(kind, { sort: "new", limit: 8 }),
            (kind === "servers" ? discoverApi.promoted(client).then((r) => (r.servers ?? []).map(fromServer).slice(0, r.slots > 0 ? undefined : 0)) : discoverApi.promotedBots(client).then((r) => (r.bots ?? []).map(fromBot).slice(0, r.slots > 0 ? undefined : 0))).catch(
              () => [] as Listing[],
            ),
          ]);
          if (current !== token.current) return;
          setFeatured(f);
          setPopular(p);
          setFresh(n);
          setTopRow(row);
          return;
        }
        const page = await fetchListings(kind, {
          query: filters.q,
          category: filters.category,
          tag: filters.tag,
          sort: filters.sort,
          limit: PAGE_SIZE,
          offset: reset ? 0 : results.length,
        });
        if (current !== token.current) return;
        setResults((old) => (reset ? page : [...old, ...page]));
        setAnswered(filters.q);
        setHasMore(page.length === PAGE_SIZE);
      } catch (err) {
        if (current !== token.current) return;
        setFailed(toAuthError(err));
      } finally {
        if (current === token.current) setLoading(false);
      }
    },
    [client, fetchListings, filters, kind, results.length],
  );

  // a new tab or filter loads afresh
  const reload = useEffectEvent(() => void load(true));
  useEffect(() => {
    // on the next turn: quick changes in a row (a tab, then a topic) load once
    const timer = setTimeout(reload, 0);
    return () => clearTimeout(timer);
  }, [kind, filters]);

  // the search writes into the filters after a short pause
  useEffect(() => {
    const words = typed.trim();
    if ((words || undefined) === filters.q) return;
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: words || undefined })), 120);
    return () => clearTimeout(timer);
  }, [typed, filters.q]);

  // top-row views count once per listing per visit
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const item of topRow) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      discoverApi.event(client, item.kind, item.id, "view").catch(() => undefined);
    }
  }, [client, topRow]);

  const pull = usePullRefresh(async () => {
    await load(true);
    return true;
  });

  /** Results on screen: what the page can tell now, then the API's list */
  const shown = useMemo(() => {
    const words = typed.trim();
    if (!words) return results;
    const pool = [...featured, ...popular, ...fresh, ...results].filter(
      (item) => item.kind === kind && (!filters.category || item.category === filters.category) && (!filters.tag || item.tags.includes(filters.tag)),
    );
    const local = findLocal(pool, words);
    return words === answered ? mergeResults(results, local) : local;
  }, [typed, results, featured, popular, fresh, kind, filters.category, filters.tag, answered]);
  const waiting = loading || (typing && typed.trim() !== answered);

  const page = useMemo(() => browsePage({ popular, featured, fresh, topRow }), [popular, featured, fresh, topRow]);

  const switchTab = (next: DiscoverKind) => {
    if (next === kind) return;
    setKind(next);
    setTyped("");
    setFilters({ sort: "popular" });
    setResults([]);
    setFeatured([]);
    setPopular([]);
    setFresh([]);
    setTopRow([]);
  };
  const pickCategory = (id?: string) => {
    setTyped("");
    setFilters((f) => ({ sort: f.sort, category: id && f.category !== id ? id : undefined }));
  };
  const pickTag = (tag: string) => {
    setBot(null);
    setTyped("");
    setFilters((f) => ({ sort: f.sort, tag }));
  };
  const clearAll = () => {
    setTyped("");
    setFilters({ sort: "popular" });
  };

  const openListing = (item: Listing) => {
    if (item.promoted) discoverApi.event(client, item.kind, item.id, "click").catch(() => undefined);
    if (item.kind === "bots") setBot(item);
    else router.push({ pathname: "/discover/[id]", params: { id: item.link ?? item.id } });
  };

  async function joinServer(item: Listing) {
    setJoinError(null);
    if (joined.includes(item.id)) return router.push({ pathname: "/server/[id]", params: { id: item.id } });
    setBusy(item.id);
    try {
      // a listed server is joined by its id; one that takes requests records one instead
      const result = (await client.api.post(`/invites/${item.id}` as never)) as { type?: string };
      if (result?.type === "JoinRequest") router.push({ pathname: "/discover/[id]", params: { id: item.link ?? item.id } });
      else router.push({ pathname: "/server/[id]", params: { id: item.id } });
    } catch (err) {
      setJoinError(toAuthError(err));
    } finally {
      setBusy(undefined);
    }
  }

  const addBot = (id: string) => {
    setBot(null);
    router.push({ pathname: "/bot/[id]", params: { id } });
  };

  const action = (item: Listing) =>
    item.kind === "servers" ? (
      <Button
        size="sm"
        variant="tonal"
        testID={`discover-join-${item.id}`}
        label={joined.includes(item.id) ? t`Visit` : t`Join`}
        status={busy === item.id ? "submitting" : "ready"}
        onPress={() => void joinServer(item)}
      />
    ) : (
      <Button size="sm" variant="tonal" testID={`discover-add-${item.id}`} label={t`Add`} onPress={() => addBot(item.id)} />
    );

  const rows = useMemo((): Row[] => {
    const cards = (items: Listing[], prefix: string): Row[] => items.map((listing) => ({ key: `${prefix}-${listing.id}`, kind: "card", listing }));
    if (showResults) {
      const out = cards(shown, "r");
      if (waiting && !shown.length) out.push({ key: "skeleton", kind: "skeleton" });
      return out;
    }
    const out: Row[] = [];
    const paid = [...(page.paid ? [page.paid] : []), ...page.topRow];
    if (paid.length) {
      if (page.topRow.length) out.push({ key: "h-top", kind: "head", icon: "megaphone", title: t`Top row` });
      out.push(...cards(paid, "p"));
    }
    if (page.picked.length) {
      out.push({ key: "h-picked", kind: "head", icon: "seal-check", title: t`Hand-picked` });
      out.push(...cards(page.picked, "f"));
    }
    if (page.list.length) {
      out.push({
        key: "h-all",
        kind: "head",
        icon: "squares-four",
        title: kind === "servers" ? t`All servers` : t`All bots`,
        onMore: page.list.length >= 12 ? () => setFilters((f) => ({ ...f, all: true })) : undefined,
      });
      out.push(...cards(page.list, "a"));
    }
    if (loading && !page.list.length && !page.picked.length) out.push({ key: "skeleton", kind: "skeleton" });
    return out;
  }, [showResults, shown, waiting, page, kind, loading, t]);

  const resultsTitle = typed.trim() || filters.q ? t`Results for “${typed.trim() || filters.q}”` : filters.tag ? `#${filters.tag}` : filters.category ? labels.category(filters.category) : kind === "bots" ? t`All bots` : t`All servers`;
  const searchLabel = kind === "bots" ? t`Search bots` : t`Search servers`;
  // a server of yours not on Discover yet (follows joins, leaves and the setting)
  const unlistedId = useSolid(useCallback(() => client.servers.toList().find((s) => s.ownerId === client.user?.id && !s.discoverable)?.id, [client]));
  const unlisted = unlistedId ? client.servers.get(unlistedId) : undefined;

  const header = (
    <View style={{ gap: 16, paddingTop: 8, paddingBottom: 12 }}>
      {/* the one bar: Servers and Bots, and the search at its end */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8, flex: 1 }}>
          {(
            [
              { id: "servers", icon: "users-three", label: t`Servers` },
              { id: "bots", icon: "robot", label: t`Bots` },
            ] as const
          ).map((tab) => (
            <Chip key={tab.id} radio icon={tab.icon} selected={kind === tab.id} label={tab.label} onPress={() => switchTab(tab.id)} testID={`discover-tab-${tab.id}`} />
          ))}
        </View>
        <HeaderButton
          icon={searchOpen ? "x" : "magnifying-glass"}
          label={searchLabel}
          testID="discover-search-toggle"
          onPress={() => {
            if (searchOpen) setTyped("");
            setSearchOpen((v) => !v);
          }}
        />
      </View>
      {searchOpen ? (
        <View style={{ flexDirection: "row" }}>
          <SearchField value={typed} onChange={setTyped} placeholder={searchLabel} testID="search-discover" />
        </View>
      ) : null}

      {!showResults ? (
        <View style={{ gap: 8, paddingTop: 8 }}>
          <AText size={28} line={36} weight="bold" color={palette.header} accessibilityRole="header">
            {kind === "servers" ? (
              <Trans>
                Find your{" "}
                <AText size={28} line={36} weight="bold" color={palette.accentText}>
                  community
                </AText>
              </Trans>
            ) : (
              <Trans>
                Find the right{" "}
                <AText size={28} line={36} weight="bold" color={palette.accentText}>
                  bot
                </AText>
              </Trans>
            )}
          </AText>
          <AText size={15} line={22} color={palette.fg2}>
            {kind === "servers"
              ? t`Communities their owners run and the Zrzur team checks. Look around before you join.`
              : t`Bots people built for their servers. See what each one does and which permissions it asks for.`}
          </AText>
        </View>
      ) : null}

      {/* topics: sideways, the current one lit */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel={t`Categories`} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 8 }} />
        <Chip radio label={t`All`} selected={!filters.category && !filters.tag && !typing} onPress={clearAll} testID="discover-category-all" />
        {CATEGORIES[kind].map((c) => (
          <Chip key={c.id} radio icon={c.icon as IconName} label={labels.category(c.id)} selected={filters.category === c.id} onPress={() => pickCategory(c.id)} testID={`discover-category-${c.id}`} />
        ))}
        {filters.tag ? <Chip selected icon="x" label={`#${filters.tag}`} accessibilityLabel={t`Remove filter`} onPress={() => setFilters((f) => ({ ...f, tag: undefined }))} testID="discover-tag-clear" /> : null}
        <View style={{ width: 8 }} />
      </ScrollView>

      {joinError ? <ErrorBox message={errorText(i18n, joinError)} details={errorDetails(joinError)} /> : null}

      {showResults ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flexShrink: 1 }}>
            <AText autoDir={resultsTitle} size={17} line={24} weight="bold" color={palette.header} accessibilityRole="header" numberOfLines={1}>
              {resultsTitle}
            </AText>
            {shown.length ? (
              <AText size={13} line={18} color={palette.muted} accessibilityLiveRegion="polite">
                {t`${plural(shown.length, { one: "# result", other: "# results" })}`}
              </AText>
            ) : null}
          </View>
          <View accessibilityLabel={t`Sort`} style={{ flexDirection: "row", gap: 8 }}>
            <Chip radio label={t`Popular`} selected={filters.sort === "popular"} onPress={() => setFilters((f) => ({ ...f, sort: "popular" }))} testID="discover-sort-popular" />
            <Chip radio label={t`New`} selected={filters.sort === "new"} onPress={() => setFilters((f) => ({ ...f, sort: "new" }))} testID="discover-sort-new" />
          </View>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ gap: 16, paddingTop: 12 }}>
      {failed ? (
        <View testID="discover-error" style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
          <AText size={15} line={22} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
            {t`Discover couldn't be loaded right now.`}
          </AText>
          {failed.type !== "Network" ? <ErrorBox message={errorText(i18n, failed)} details={errorDetails(failed)} /> : null}
          <Button testID="discover-retry" variant="tonal" label={t`Try again`} onPress={() => void load(true)} />
        </View>
      ) : null}

      {showResults && !waiting && !failed && !shown.length ? (
        <View testID="discover-empty" style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
          <AText size={15} line={22} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
            {t`Nothing matches your search.`}
          </AText>
          <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
            {t`Try another word, tag or category.`}
          </AText>
          <Button variant="tonal" label={t`Clear filters`} onPress={clearAll} testID="discover-clear" />
        </View>
      ) : null}
      {showResults && !waiting && !failed && !shown.length && popular.length ? (
        <View style={{ gap: 12 }}>
          <SectionHead icon="lightning" title={kind === "servers" ? t`Popular communities` : t`Popular bots`} />
          {popular.slice(0, 4).map((item) => (
            <ListingCard key={item.id} listing={item} cdn={cdn} onOpen={() => openListing(item)} action={action(item)} />
          ))}
        </View>
      ) : null}
      {showResults && hasMore && !typing ? (
        <Button variant="tonal" testID="discover-more" label={loading ? t`Loading…` : t`Load more`} status={loading ? "submitting" : "ready"} onPress={() => void load(false)} fill />
      ) : null}

      {!showResults && !loading && !failed && !popular.length && !featured.length ? (
        <View testID="discover-empty" style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
          <AText size={15} line={22} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
            {kind === "servers" ? t`No servers are listed yet.` : t`No bots are listed yet.`}
          </AText>
          <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
            {kind === "servers" ? t`Server owners can submit theirs from Server settings → Discover.` : t`Bot owners can submit theirs from the bot's settings.`}
          </AText>
        </View>
      ) : null}

      {!showResults ? (
        // for owners: how to get listed
        <View testID="discover-owners" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.field }}>
          <Icon name={kind === "servers" ? "users-three" : "robot"} size={24} color={palette.accentText} />
          <View style={{ flex: 1, gap: 8 }}>
            <AText size={15} line={22} weight="bold" color={palette.header}>
              {kind === "servers" ? t`Own a server?` : t`Made a bot?`}
            </AText>
            <AText size={14} line={20} color={palette.fg2}>
              {kind === "servers" ? t`Server owners can submit theirs from Server settings → Discover.` : t`Bot owners can submit theirs from the bot's settings.`}
            </AText>
            {kind === "servers" && unlisted ? (
              <Pressable
                testID="discover-owners-add"
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/server-section/[id]/[section]", params: { id: unlisted.id, section: "overview" } })}
                style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: 10, justifyContent: "center", alignSelf: "flex-start", backgroundColor: pressed ? palette.accentPressed : palette.accent })}
              >
                <AText size={15} line={20} weight="semibold" color={palette.onAccent} numberOfLines={1}>
                  <Trans>
                    Add <AText size={15} line={20} weight="semibold" color={palette.onAccent}>{unlisted.name}</AText> to Discover
                  </Trans>
                </AText>
              </Pressable>
            ) : (
              <Pressable
                testID="discover-owners-link"
                accessibilityRole="link"
                onPress={() => void openExternal(kind === "servers" ? `${WEBSITE}/legal/discover-guidelines` : `${APP}/developers`)}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
              >
                <AText size={14} line={20} weight="semibold" color={palette.link}>
                  {kind === "servers" ? t`Discover rules` : t`Developer Portal`}
                </AText>
                <Icon name="arrow-square-out" size={16} color={palette.link} />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
      <View style={{ height: 96 }} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <FlashList
        ref={listRef}
        testID="discover-list"
        refreshControl={pull.control}
        onScroll={pull.onScroll}
        scrollEventThrottle={16}
        {...keyboardScrollProps}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item: row }) =>
          row.kind === "head" ? (
            <View style={{ paddingTop: 12, paddingBottom: 4 }}>
              <SectionHead icon={row.icon} title={row.title} onMore={row.onMore} />
            </View>
          ) : row.kind === "skeleton" ? (
            <CardSkeletons count={3} />
          ) : (
            <View style={{ paddingBottom: 12 }}>
              <ListingCard listing={row.listing} cdn={cdn} onOpen={() => openListing(row.listing)} action={action(row.listing)} />
            </View>
          )
        }
      />
      <PhoneTabs current="discover" onYou={() => setYou(true)} />
      <YouSheet visible={you} onClose={() => setYou(false)} />
      <BotDetail
        listing={bot}
        cdn={cdn}
        onClose={() => setBot(null)}
        onTag={pickTag}
        onAdd={addBot}
        onReport={(item) => {
          setBot(null);
          setReport({ kind: "DiscoverBot", id: item.id, label: item.name });
        }}
      />
      <ReportSheet spec={report} onClose={() => setReport(null)} />
    </SafeAreaView>
  );
}
