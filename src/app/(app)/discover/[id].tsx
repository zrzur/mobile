import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { toAuthError } from "@/auth/flow";
import { errorDetails, errorText } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useServerIds } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { ErrorBox } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { discoverApi } from "@/ui/discover/api";
import { Fact, useNumber } from "@/ui/discover/BotDetail";
import { ListingBanner, MarkPill, TagRow, useCountLabel } from "@/ui/discover/Cards";
import { useDiscoverLabels } from "@/ui/discover/labels";
import { type Listing, fromServer, isPaidListing, listingBadge } from "@/ui/discover/logic";
import { fileUrl, useCdn } from "@/ui/invite/media";
import { AText, Button, Icon, ParagraphText, PressableRow, ScreenHeader, Skeleton } from "@/ui/kit";
import { BadgeMark } from "@/ui/profile/parts";
import { ReportSheet, type ReportSpec } from "@/ui/profile/ReportFlow";

type JoinState = "idle" | "busy" | "requested" | "closed";
type Load = { state: "loading" } | { state: "missing" } | { state: "failed"; error: ReturnType<typeof toAuthError> } | { state: "ready"; item: Listing };

/** A heading and its part of the page */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AText size={17} line={24} weight="bold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      {children}
    </View>
  );
}

/**
 * A listed server's own page (web: discover/ServerPage at phone width):
 * banner, icon and name, About, Similar communities, the facts and tags, and
 * one way in fixed to the foot of the screen. Joining keeps the server's
 * access mode: open servers let people in, "by request" records a request,
 * locked ones refuse.
 */
export default function DiscoverServerPage() {
  const { id: slug } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const cdn = useCdn();
  const joined = useServerIds();
  const labels = useDiscoverLabels();
  const number = useNumber();
  const count = useCountLabel();
  const [tick, setTick] = useState(0);
  const key = `${slug}#${tick}`;
  const [answer, setAnswer] = useState<{ key: string; load: Load }>();
  const load: Load = answer?.key === key ? answer.load : { state: "loading" };
  const [similarOf, setSimilarOf] = useState<{ id: string; list: Listing[] }>();
  const [join, setJoin] = useState<JoinState>("idle");
  const [joinError, setJoinError] = useState<ReturnType<typeof toAuthError> | null>(null);
  const [report, setReport] = useState<ReportSpec | null>(null);

  useEffect(() => {
    let alive = true;
    discoverApi
      .server(client, String(slug ?? ""))
      .then((data) => alive && setAnswer({ key, load: { state: "ready", item: fromServer(data) } }))
      .catch((err) => {
        if (!alive) return;
        const error = toAuthError(err);
        // a server that left Discover (or never was on it) is not an error
        setAnswer({ key, load: error.type === "NotFound" ? { state: "missing" } : { state: "failed", error } });
      });
    return () => {
      alive = false;
    };
  }, [client, slug, key]);

  const item = load.state === "ready" ? load.item : undefined;
  const itemId = item?.id;
  const category = item?.category;
  useEffect(() => {
    if (!itemId || !category) return;
    let alive = true;
    discoverApi
      .servers(client, { category, limit: 8 })
      .then((list) => alive && setSimilarOf({ id: itemId, list: list.map(fromServer).filter((other) => other.id !== itemId && !isPaidListing(other)).slice(0, 3) }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, itemId, category]);
  const similar = similarOf && similarOf.id === itemId ? similarOf.list : [];

  const member = !!item && joined.includes(item.id);
  const openServer = useCallback((id: string) => router.push({ pathname: "/server/[id]", params: { id } }), []);

  async function joinServer() {
    if (!item) return;
    if (member) return openServer(item.id);
    setJoin("busy");
    setJoinError(null);
    try {
      const result = (await client.api.post(`/invites/${item.id}` as never)) as { type?: string };
      if (result?.type === "JoinRequest") return setJoin("requested");
      setJoin("idle");
      openServer(item.id);
    } catch (err) {
      const error = toAuthError(err);
      if (/Locked|InvitesPaused|NotFound|Banned|InvalidOperation/.test(error.type)) setJoin("closed");
      else {
        setJoin("idle");
        setJoinError(error);
      }
    }
  }

  const header = (
    <ScreenHeader back>
      <AText autoDir={item?.name} size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
        {item?.name ?? t`Discover`}
      </AText>
    </ScreenHeader>
  );

  if (load.state !== "ready" || !item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
        {header}
        {load.state === "loading" ? (
          <View testID="discover-page-loading">
            <View style={{ height: 140, backgroundColor: palette.field }} />
            <View style={{ padding: 16, gap: 12 }}>
              <Skeleton width="60%" height={28} />
              <Skeleton width="90%" height={16} />
              <Skeleton width="80%" height={16} />
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }} testID={`discover-page-${load.state}`}>
            <Icon name={load.state === "missing" ? "compass" : "warning-circle"} size={32} color={palette.muted} />
            <AText size={17} line={24} weight="bold" color={palette.header} style={{ textAlign: "center" }}>
              {load.state === "missing" ? t`This server isn't on Discover.` : t`This page couldn't be loaded right now.`}
            </AText>
            {load.state === "missing" ? (
              <AText size={14} line={20} color={palette.fg2} style={{ textAlign: "center" }}>
                {t`Its owner may have taken it off, or the link is mistyped.`}
              </AText>
            ) : load.state === "failed" && load.error.type !== "Network" ? (
              <ErrorBox message={errorText(i18n, load.error)} details={errorDetails(load.error)} />
            ) : null}
            {load.state === "missing" ? (
              <Button variant="tonal" label={t`Browse Discover`} onPress={() => router.replace("/discover")} />
            ) : (
              <Button variant="tonal" label={t`Try again`} onPress={() => setTick((n) => n + 1)} />
            )}
          </View>
        )}
      </SafeAreaView>
    );
  }

  const badge = listingBadge(item);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right"]}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} testID="discover-page">
        <ListingBanner listing={item} cdn={cdn} height={140} />
        <View style={{ paddingHorizontal: 16, gap: 24 }}>
          <View style={{ gap: 8, marginTop: -52 }}>
            <View style={{ alignSelf: "flex-start", padding: 4, borderRadius: 28, backgroundColor: palette.frame }}>
              <Avatar url={fileUrl(cdn, "icons", item.icon)} name={item.name} size={88} square />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AText autoDir size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header" style={{ flexShrink: 1 }}>
                {item.name}
              </AText>
              {badge ? <BadgeMark id={badge} size={20} /> : null}
            </View>
            {isPaidListing(item) ? <MarkPill listing={item} /> : null}
          </View>

          <Part title={t`About this server`}>
            {item.description?.trim() ? (
              // each line in its own direction (an Arabic line on the right in the English app)
              <ParagraphText size={15} line={22} color={palette.fg2} selectable>
                {item.description.trim()}
              </ParagraphText>
            ) : (
              <AText size={15} line={22} color={palette.muted}>
                {t`No description yet.`}
              </AText>
            )}
          </Part>

          <Part title={t`Server details`}>
            <View>
              {item.online != null ? <Fact label={t`Online now`} value={number(item.online)} live /> : null}
              <Fact label={t`Members`} value={number(item.count)} />
              {item.category ? <Fact label={t`Category`} value={labels.category(item.category)} /> : null}
              {item.language ? <Fact label={t`Language`} value={labels.language(item.language)} /> : null}
            </View>
            {item.tags.length ? <TagRow tags={item.tags} /> : null}
          </Part>

          {similar.length ? (
            <Part title={t`Similar communities`}>
              <View style={{ gap: 8 }}>
                {similar.map((other) => (
                  <PressableRow
                    key={other.id}
                    testID={`discover-similar-${other.id}`}
                    accessibilityRole="link"
                    accessibilityLabel={other.name}
                    highlight={palette.navSelected}
                    onPress={() => router.push({ pathname: "/discover/[id]", params: { id: other.link ?? other.id } })}
                    style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 14, backgroundColor: palette.field }}
                  >
                    <Avatar url={fileUrl(cdn, "icons", other.icon)} name={other.name} size={44} square />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
                        {other.name}
                      </AText>
                      <AText size={13} line={18} color={palette.muted} numberOfLines={1}>
                        {count("servers", other.count)}
                      </AText>
                    </View>
                    <Icon name="caret-right" size={16} color={palette.iconMuted} />
                  </PressableRow>
                ))}
              </View>
            </Part>
          ) : null}

          <Pressable
            testID="discover-report"
            accessibilityRole="button"
            onPress={() => setReport({ kind: "DiscoverServer", id: item.id, label: item.name })}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 8, marginStart: -8, borderRadius: 10, backgroundColor: pressed ? palette.navHover : "transparent" })}
          >
            <Icon name="flag" size={16} color={palette.fg2} />
            <AText size={14} line={20} weight="semibold" color={palette.fg2}>
              {t`Report server`}
            </AText>
          </Pressable>
        </View>
      </ScrollView>

      {/* the way in, fixed to the foot of the screen */}
      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12 + insets.bottom, gap: 8, borderTopWidth: 1, borderTopColor: palette.borderSoft, backgroundColor: palette.frame }} accessibilityLiveRegion="polite">
        {!member ? (
          <View style={{ gap: 2 }} testID={`discover-join-state-${join}`}>
            <AText size={14} line={20} weight="semibold" color={join === "closed" ? palette.danger : join === "requested" ? palette.warningText : palette.onlineText}>
              {join === "requested" ? t`Request sent` : join === "closed" ? t`Joining is closed right now` : t`Open to everyone`}
            </AText>
            <AText size={13} line={18} color={palette.fg2}>
              {join === "requested"
                ? t`You'll join as soon as a moderator approves it.`
                : join === "closed"
                  ? t`Try again later, or look at similar communities.`
                  : t`You join right away.`}
            </AText>
          </View>
        ) : null}
        {joinError ? <ErrorBox message={errorText(i18n, joinError)} details={errorDetails(joinError)} /> : null}
        <Button
          fill
          testID="discover-page-join"
          disabled={join === "requested" || join === "closed"}
          status={join === "busy" ? "submitting" : "ready"}
          label={join === "requested" ? t`Waiting for approval` : join === "closed" ? t`Joining is closed` : member ? t`Go to server` : t`Join ${item.name}`}
          onPress={() => void joinServer()}
        />
      </View>
      <ReportSheet spec={report} onClose={() => setReport(null)} />
    </SafeAreaView>
  );
}
