import { usePathname } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { useClient } from "@/client/ClientProvider";
import { useSelfId } from "@/client/hooks";
import { notePlace } from "@/ui/find/recentPlaces";
import { ReminderNotices } from "@/ui/inbox/ReminderNotices";

import { ChangelogSheet } from "./ChangelogSheet";
import { NoticeCenter } from "./NoticeCenter";
import { NoticeSnack } from "./NoticeSnack";
import { PolicySheet } from "./PolicySheet";
import { SaveDataOffer } from "./SaveDataOffer";

/** Remembers each page visited, for "Go to" (web: notePlace on every navigation) */
function PlaceRecorder() {
  const pathname = usePathname();
  const selfId = useSelfId();
  useEffect(() => {
    void notePlace(pathname, selfId);
  }, [pathname, selfId]);
  return null;
}

/**
 * A refused live connection (the session was ended on another device, or
 * the account was closed) asks the server whether the session still
 * stands; an ended one signs out with "You've been logged out" (row 113).
 */
function SessionWatch() {
  const client = useClient();
  const { checkSession } = useAuth();
  useEffect(() => {
    const on = (error: unknown) => {
      const type = (error as { type?: string } | null)?.type;
      if (type === "InvalidSession" || type === "NotAuthenticated") checkSession();
    };
    client.events.on("error", on as never);
    return () => {
      client.events.off("error", on as never);
    };
  }, [client, checkSession]);
  return null;
}

/**
 * Everything the signed-in app says on its own, mounted once inside the
 * client (coordinator: in `(app)/_layout.tsx`, next to ChatOverlays):
 * notices from the Zrzur team, policy changes, "What's new", reminders that
 * come due, the one-time Save data offer, the short message with a button
 * they share, and the recent places "Go to" lists first.
 */
export function AppNotices() {
  return (
    <>
      <NoticeCenter />
      <PolicySheet />
      <ChangelogSheet />
      <ReminderNotices />
      <SaveDataOffer />
      <PlaceRecorder />
      <SessionWatch />
      <NoticeSnack />
    </>
  );
}
