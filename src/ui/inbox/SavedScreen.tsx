import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { fetchSaved, messageOf, type SavedEntry, unsaveMessage } from "@/chat/keep";
import { intlLocale } from "@/chat/time";
import { RemindSheet } from "@/chat/RemindSheet";
import { relativeParts } from "@/chat/rich/poll";
import { useClient } from "@/client/ClientProvider";
import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote, GroupRow, RowGroup, SearchField, Sheet } from "@/ui/app/parts";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { closeSwipeRows } from "@/ui/kit/SwipeRow";
import { AText } from "@/ui/kit/Text";
import { Toast, useToast } from "@/ui/settings/user/profile-parts";

import { EntryAction, InboxEntry } from "./InboxEntry";
import { InboxPage, openMessage } from "./InboxPage";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

const PAGE = 30;

/** "2 days ago" (web: Time format="relative") */
export function agoText(locale: string, at: number, now = Date.now()) {
  const rel = relativeParts(at - now);
  return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" }).format(rel.value, rel.unit);
}

/**
 * Saved messages (web: SavedPanel): the private list of messages a person
 * kept with "Save message". Only they see it. It can be searched (words,
 * file names, who wrote it), an entry jumps to its message, and each one
 * can be removed or given a reminder.
 *
 * Saved messages                                   [x]
 * Only you see this list.
 * [ Search saved messages            ]
 * [avatar] Name            2d   [clock] [x]
 *          Server · #channel
 *          words of the message…
 * [ Show more ]
 */
export function SavedScreen() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remind, setRemind] = useState<Message | null>(null);
  const [menu, setMenu] = useState<SavedEntry | null>(null);
  const [toast, showToast] = useToast();
  /** each load gets a number; an older, slower one never wins */
  const latest = useRef(0);

  // searching waits until the typing pauses; a new search shows the loading rows
  useEffect(() => {
    const next = typed.trim();
    if (next === query) return;
    const timer = setTimeout(() => {
      setState("loading");
      setQuery(next);
    }, 250);
    return () => clearTimeout(timer);
  }, [typed, query]);

  /** read a page: the first (a new list) or the next after `list` */
  const load = (append: boolean, list: SavedEntry[]) => {
    const run = ++latest.current;
    const last = append ? list.at(-1) : undefined;
    return fetchSaved(client, { limit: PAGE, query: query || undefined, before: last?.saved_at }).then(
      (page) => {
        if (run !== latest.current) return false;
        setEntries(append ? [...list, ...page.entries] : page.entries);
        setMore(page.entries.length === PAGE);
        setState("ready");
        setLoadingMore(false);
        return true;
      },
      () => {
        if (run !== latest.current) return false;
        if (!append) setState("error");
        setLoadingMore(false);
        return false;
      },
    );
  };

  // a new search reads the list from the start
  useEffect(() => {
    const run = ++latest.current;
    fetchSaved(client, { limit: PAGE, query: query || undefined }).then(
      (page) => {
        if (run !== latest.current) return;
        setEntries(page.entries);
        setMore(page.entries.length === PAGE);
        setState("ready");
      },
      () => run === latest.current && setState("error"),
    );
  }, [query, client]);

  const pull = usePullRefresh(() => load(false, entries));
  const showMore = () => {
    setLoadingMore(true);
    void load(true, entries);
  };

  const remove = async (entry: SavedEntry) => {
    try {
      await unsaveMessage(client, entry.message);
      haptics.success();
      setEntries((list) => list.filter((item) => item.message !== entry.message));
    } catch (err) {
      haptics.error();
      showToast(describeError(err));
    }
  };

  const body = () => {
    if (state === "loading") return <SkeletonRows count={6} avatar={36} testID="saved-loading" />;
    if (state === "error") return <CenterNote icon="warning-circle">{t`Saved messages couldn't load. Try again soon.`}</CenterNote>;
    if (!entries.length && query) return <CenterNote icon="magnifying-glass">{t`No saved message matches your search.`}</CenterNote>;
    if (!entries.length)
      return (
        <View testID="saved-empty">
          <CenterNote icon="bookmark-simple">{t`Nothing saved yet. Choose "Save message" in a message's menu to keep it here.`}</CenterNote>
        </View>
      );
    return (
      <>
        <View style={{ marginHorizontal: 12, borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>
          {entries.map((entry, i) => {
            const message = messageOf(client, entry);
            return (
              <InboxEntry
                key={entry.message}
                testID="saved-entry"
                first={i === 0}
                message={message}
                note={agoText(i18n.locale, entry.saved_at)}
                onOpen={openMessage}
                onMenu={() => setMenu(entry)}
                swipe={[
                  ...(message
                    ? [{ key: "remind", label: t`Remind me`, icon: "clock" as const, color: palette.tonal, ink: palette.fg, onPress: () => setRemind(message) }]
                    : []),
                  { key: "remove", label: t`Remove from saved`, icon: "x" as const, color: palette.dangerFill, ink: palette.onAccent, onPress: () => void remove(entry) },
                ]}
                actions={
                  <>
                    {message ? <EntryAction icon="clock" label={t`Remind me`} testID="saved-remind" onPress={() => setRemind(message)} /> : null}
                    <EntryAction icon="x" label={t`Remove from saved`} testID="saved-remove" onPress={() => void remove(entry)} />
                  </>
                }
              />
            );
          })}
        </View>
        {more ? (
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <Button size="sm" variant="tonal" label={t`Show more`} disabled={loadingMore} status={loadingMore ? "submitting" : "ready"} onPress={showMore} />
          </View>
        ) : null}
      </>
    );
  };

  const menuMessage = menu ? messageOf(client, menu) : undefined;

  return (
    <InboxPage title={t`Saved messages`} testID="saved-panel">
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 12 }}>
        <AText size={14} line={20} color={palette.muted}>
          {t`Only you see this list.`}
        </AText>
        <View style={{ flexDirection: "row" }}>
          <SearchField value={typed} onChange={setTyped} placeholder={t`Search saved messages`} testID="saved-search" />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={pull.control}
        onScroll={pull.onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={closeSwipeRows}
        {...keyboardScrollProps}
      >
        {body()}
      </ScrollView>
      <Sheet visible={!!menu} onClose={() => setMenu(null)} testID="saved-menu">
        <RowGroup>
          {menuMessage ? (
            <GroupRow
              first
              icon="chat-circle"
              label={t`Open message`}
              onPress={() => {
                setMenu(null);
                openMessage(menuMessage);
              }}
            />
          ) : null}
          {menuMessage ? (
            <GroupRow
              icon="clock"
              label={t`Remind me`}
              onPress={() => {
                setMenu(null);
                setRemind(menuMessage);
              }}
            />
          ) : null}
          <GroupRow
            first={!menuMessage}
            icon="x"
            danger
            label={t`Remove from saved`}
            onPress={() => {
              const entry = menu;
              setMenu(null);
              if (entry) void remove(entry);
            }}
          />
        </RowGroup>
      </Sheet>
      {remind ? <RemindSheet message={remind} onClose={() => setRemind(null)} onToast={showToast} /> : null}
      <Toast text={toast} testID="saved-toast" />
    </InboxPage>
  );
}
