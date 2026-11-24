import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { canAddReminder, fetchReminders, messageOf, type Reminder, type RemindersAnswer, removeReminder, splitReminders, useReminderChanges } from "@/chat/keep";
import { RemindSheet } from "@/chat/RemindSheet";
import { messageTime } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote, GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { closeSwipeRows, type SwipeAction } from "@/ui/kit/SwipeRow";
import { AText } from "@/ui/kit/Text";
import { Toast, useToast } from "@/ui/settings/user/profile-parts";

import { EntryAction, InboxEntry } from "./InboxEntry";
import { InboxPage, openMessage, useBillingAvailable } from "./InboxPage";
import { agoText } from "./SavedScreen";

/**
 * Reminders (web: RemindersPanel): the messages a person asked to be
 * reminded of. The ones whose time has come are on top until they are
 * cleared; the waiting ones follow, soonest first, each with its time, a
 * way to change it and a way to cancel.
 *
 * Reminders                                        [x]
 * 3 of 10 waiting.            [ Up to 25 with Feather ]
 * Due
 * [avatar] Name      1h ago            [check]
 * Upcoming
 * [avatar] Name      Tomorrow 09:00    [pencil] [x]
 */
export function RemindersScreen() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const billing = useBillingAvailable(client);
  const changes = useReminderChanges();
  const [answer, setAnswer] = useState<RemindersAnswer>();
  const [failed, setFailed] = useState(false);
  const [move, setMove] = useState<{ message: Message; reminder: Reminder } | null>(null);
  const [menu, setMenu] = useState<Reminder | null>(null);
  const [toast, showToast] = useToast();
  const latest = useRef(0);
  const has = useRef(false);

  /** each load gets a number; an older, slower one never wins */
  const load = () => {
    const run = ++latest.current;
    return fetchReminders(client).then(
      (next) => {
        if (run !== latest.current) return false;
        has.current = true;
        setAnswer(next);
        setFailed(false);
        return true;
      },
      () => {
        if (run === latest.current && !has.current) setFailed(true);
        return false;
      },
    );
  };
  // again whenever a reminder is set, moved, removed or comes due
  useEffect(() => {
    const run = ++latest.current;
    fetchReminders(client).then(
      (next) => {
        if (run !== latest.current) return;
        has.current = true;
        setAnswer(next);
        setFailed(false);
      },
      () => {
        if (run === latest.current && !has.current) setFailed(true);
      },
    );
  }, [changes, client]);
  const pull = usePullRefresh(load);

  const lists = useMemo(() => splitReminders(answer?.reminders ?? []), [answer]);
  const full = !canAddReminder(lists.waiting.length, answer?.max_active);
  /** Feather would raise the limit, and can be had here */
  const featherHelps = billing && !!answer && answer.max_active < answer.max_active_plus;

  const remove = async (reminder: Reminder) => {
    try {
      await removeReminder(client, reminder._id);
      haptics.success();
      setAnswer((current) => (current ? { ...current, reminders: current.reminders.filter((r) => r._id !== reminder._id) } : current));
    } catch (err) {
      haptics.error();
      showToast(describeError(err));
    }
  };

  const changeTime = (reminder: Reminder) => {
    const message = messageOf(client, reminder);
    if (message) setMove({ message, reminder });
  };

  const section = (label: string) => (
    <AText size={13} line={20} weight="semibold" color={palette.muted} accessibilityRole="header" style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
      {label}
    </AText>
  );
  const card = (children: React.ReactNode) => <View style={{ marginHorizontal: 12, borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>{children}</View>;

  const body = () => {
    if (failed) return <CenterNote icon="warning-circle">{t`Reminders couldn't load. Try again soon.`}</CenterNote>;
    if (!answer) return <SkeletonRows count={5} avatar={36} testID="reminders-loading" />;
    if (!answer.reminders.length)
      return (
        <View testID="reminders-empty">
          <CenterNote icon="clock">{t`No reminders. Choose "Remind me" in a message's menu and it comes back to you at the time you pick.`}</CenterNote>
        </View>
      );
    return (
      <>
        {lists.due.length ? (
          <>
            {section(t`Due`)}
            {card(
              lists.due.map((reminder, i) => {
                const clear: SwipeAction = { key: "clear", label: t`Done, clear it`, icon: "check", color: palette.accent, ink: palette.onAccent, onPress: () => void remove(reminder) };
                return (
                  <InboxEntry
                    key={reminder._id}
                    testID="reminder-due"
                    first={i === 0}
                    message={messageOf(client, reminder)}
                    note={agoText(i18n.locale, reminder.delivered_at!)}
                    onOpen={openMessage}
                    onMenu={() => setMenu(reminder)}
                    swipe={[clear]}
                    actions={<EntryAction icon="check" label={t`Done, clear it`} testID="reminder-clear" onPress={() => void remove(reminder)} />}
                  />
                );
              }),
            )}
          </>
        ) : null}
        {lists.waiting.length ? (
          <>
            {section(t`Upcoming`)}
            {card(
              lists.waiting.map((reminder, i) => {
                const message = messageOf(client, reminder);
                const swipe: SwipeAction[] = [
                  ...(message ? [{ key: "move", label: t`Change the time`, icon: "pencil-simple" as const, color: palette.tonal, ink: palette.fg, onPress: () => changeTime(reminder) }] : []),
                  { key: "cancel", label: t`Cancel reminder`, icon: "x", color: palette.dangerFill, ink: palette.onAccent, onPress: () => void remove(reminder) },
                ];
                return (
                  <InboxEntry
                    key={reminder._id}
                    testID="reminder-waiting"
                    first={i === 0}
                    message={message}
                    note={messageTime(i18n, new Date(reminder.due_at))}
                    onOpen={openMessage}
                    onMenu={() => setMenu(reminder)}
                    swipe={swipe}
                    actions={
                      <>
                        {message ? <EntryAction icon="pencil-simple" label={t`Change the time`} testID="reminder-move" onPress={() => changeTime(reminder)} /> : null}
                        <EntryAction icon="x" label={t`Cancel reminder`} testID="reminder-cancel" onPress={() => void remove(reminder)} />
                      </>
                    }
                  />
                );
              }),
            )}
          </>
        ) : null}
      </>
    );
  };

  const menuMessage = menu ? messageOf(client, menu) : undefined;
  const menuDue = menu?.delivered_at != null;

  return (
    <InboxPage title={t`Reminders`} testID="reminders-panel">
      <View style={{ paddingHorizontal: 16, paddingTop: 4, minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12 }}>
        {answer ? (
          <AText testID="reminders-count" size={14} line={20} color={full ? palette.warningText : palette.muted}>
            {t`${lists.waiting.length} of ${answer.max_active} waiting.`}
          </AText>
        ) : (
          <AText size={14} line={20} color={palette.muted}>
            {t`Messages you asked to be reminded of.`}
          </AText>
        )}
        {featherHelps ? (
          <Button
            testID="reminders-feather"
            size="sm"
            variant="ghost"
            label={t`Up to ${answer!.max_active_plus} with Feather`}
            onPress={() => router.push({ pathname: "/user-settings/[section]", params: { section: "plus" } })}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={pull.control} onScroll={pull.onScroll} scrollEventThrottle={16} onScrollBeginDrag={closeSwipeRows}>
        {body()}
      </ScrollView>
      <Sheet visible={!!menu} onClose={() => setMenu(null)} testID="reminder-menu">
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
          {menuMessage && !menuDue ? (
            <GroupRow
              icon="pencil-simple"
              label={t`Change the time`}
              onPress={() => {
                const reminder = menu!;
                setMenu(null);
                changeTime(reminder);
              }}
            />
          ) : null}
          <GroupRow
            first={!menuMessage}
            icon={menuDue ? "check" : "x"}
            danger={!menuDue}
            label={menuDue ? t`Done, clear it` : t`Cancel reminder`}
            onPress={() => {
              const reminder = menu;
              setMenu(null);
              if (reminder) void remove(reminder);
            }}
          />
        </RowGroup>
      </Sheet>
      {move ? <RemindSheet message={move.message} reminder={move.reminder} onClose={() => setMove(null)} onToast={showToast} /> : null}
      <Toast text={toast} testID="reminders-toast" />
    </InboxPage>
  );
}
