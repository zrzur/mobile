/**
 * Where event links land in the app (web: EventLinkPage, EventInvitationPage).
 *
 * A share link (`/e/<name>-<code>`): a member of the event's server goes
 * straight to the event; anyone else sees the event's card (title, time and
 * server, nothing about who comes). An invitation link (`/e/join/<code>`):
 * the person joins the invited people and goes to the event.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";

import { DateMark } from "./EventCard";
import { eventTimes, isInvitationCode, isSharePath } from "./eventFormat";
import { acceptEventInvitation, type EventLinkPreview, fetchEventLink } from "./eventsStore";

const goEvent = (server: string, event: string) => router.replace({ pathname: "/event/[id]", params: { id: event, server } });

function Frame({ testID, children }: { testID: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <SafeAreaView testID={testID} style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <View style={{ flex: 1 }} />
      </ScreenHeader>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16, paddingBottom: 48, gap: 16 }}>{children}</View>
    </SafeAreaView>
  );
}

function Gone({ title, text }: { title: string; text: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Icon name="calendar" size={32} color={palette.fg2} />
        <AText size={20} line={28} weight="bold" color={palette.header} style={{ textAlign: "center" }} accessibilityRole="header">
          {title}
        </AText>
        <AText size={13} line={20} color={palette.fg2} style={{ textAlign: "center" }}>
          {text}
        </AText>
      </View>
      <View style={{ alignItems: "center" }}>
        <Button label={t`Open Zrzur`} onPress={() => router.replace("/home")} testID="event-link-open" />
      </View>
    </>
  );
}

function Waiting() {
  const { palette } = useTheme();
  return <ActivityIndicator color={palette.muted} />;
}

/** A share link */
export function EventLinkScreen({ path }: { path: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [preview, setPreview] = useState<EventLinkPreview>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    if (!isSharePath(path)) return;
    // signed in: the server says where the event is, if you may see it
    fetchEventLink(client, path).then(
      (found) => {
        if (!live) return;
        if (found.server && found.event) return goEvent(found.server, found.event);
        setMissing(false);
        setPreview(found);
      },
      () => {
        if (!live) return;
        setPreview(undefined);
        setMissing(true);
      },
    );
    return () => {
      live = false;
    };
  }, [client, path]);

  if (missing || !isSharePath(path))
    return (
      <Frame testID="event-link-page">
        <Gone title={t`This link does not open an event`} text={t`It may have been removed, or the event is only for the members of its server.`} />
      </Frame>
    );
  if (!preview)
    return (
      <Frame testID="event-link-page">
        <Waiting />
      </Frame>
    );
  const quiet = preview.status === "Cancelled" || preview.status === "Completed";
  return (
    <Frame testID="event-link-page">
      <View testID="event-link-ticket" style={{ flexDirection: "row", gap: 16, padding: 16, borderRadius: 14, backgroundColor: palette.field, alignItems: "flex-start" }}>
        <DateMark startsAt={preview.starts_at} quiet={quiet} />
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <AText autoDir size={13} line={18} weight="semibold" color={palette.fg2}>
            {preview.server_name}
          </AText>
          <AText autoDir size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {preview.title}
          </AText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="calendar" size={16} color={palette.fg2} />
            <AText size={15} line={22} color={palette.fg2} style={{ flexShrink: 1 }}>
              {eventTimes(preview, i18n.locale)}
            </AText>
          </View>
          {preview.status === "Cancelled" ? (
            <AText size={15} line={22} color={palette.warningText}>
              {t`This event was called off.`}
            </AText>
          ) : preview.status === "Completed" ? (
            <AText size={15} line={22} color={palette.warningText}>
              {t`This event is over`}
            </AText>
          ) : null}
        </View>
      </View>
      <AText size={13} line={20} color={palette.fg2}>
        {t`Members of the server see the whole event and can answer it.`}
      </AText>
      <View style={{ alignItems: "center" }}>
        <Button label={t`Open Zrzur`} onPress={() => router.replace("/home")} testID="event-link-open" />
      </View>
    </Frame>
  );
}

/** An invitation link */
export function EventInvitationScreen({ code }: { code: string }) {
  const { t } = useLingui();
  const client = useClient();
  const [failed, setProblem] = useState<"member" | "gone">();
  const problem = isInvitationCode(code) ? failed : "gone";

  useEffect(() => {
    let live = true;
    if (!isInvitationCode(code)) return;
    acceptEventInvitation(client, code).then(
      (found) => live && goEvent(found.server, found.event),
      (failure: unknown) => live && setProblem((failure as { type?: string } | undefined)?.type === "InvalidOperation" ? "member" : "gone"),
    );
    return () => {
      live = false;
    };
  }, [client, code]);

  return (
    <Frame testID="event-invitation-page">
      {problem === "member" ? (
        <Gone title={t`Join the server first`} text={t`This invitation is for the members of the event's server. Join it, then open the link again.`} />
      ) : problem === "gone" ? (
        <Gone title={t`This invitation no longer works`} text={t`It ran out or was taken away. Ask the organiser for a new one.`} />
      ) : (
        <Waiting />
      )}
    </Frame>
  );
}
