import { useLingui } from "@lingui/react/macro";
import { JoinRequestCreated, PublicChannelInvite, type ServerPublicInvite } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorDetails, errorText } from "@/auth/errorText";
import { type AuthError, toAuthError } from "@/auth/flow";
import { useClient } from "@/client/ClientProvider";
import { useServerIds } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthButton, ErrorBox } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { AText, Button, Skeleton } from "@/ui/kit";

import { type DeadReason, type ServerInviteInfo, deadReason, isInviteCode, memberCount } from "./inviteLogic";
import { fileUrl, useCdn } from "./media";

type Step = "server" | "requested";
type Load = { state: "loading" } | { state: "dead"; reason: DeadReason | "group"; error?: AuthError } | { state: "ready"; data: ServerInviteInfo };

/** Read an invite (`GET /invites/{code}`); `retry` asks again */
export function useInvite(code: string) {
  const client = useClient();
  const [tick, setTick] = useState(0);
  // each answer belongs to one code and one try; anything else is still loading
  const key = `${code}#${tick}`;
  const [answer, setAnswer] = useState<{ key: string; load: Load }>();
  const setLoad = useCallback((load: Load) => setAnswer({ key, load }), [key]);
  useEffect(() => {
    let alive = true;
    if (!isInviteCode(code)) return;
    (client.api.get(`/invites/${code}` as never) as Promise<unknown>)
      .then((answer) => {
        if (!alive) return;
        const data = answer as ServerInviteInfo | { type: string };
        if (data.type !== "Server") return setLoad({ state: "dead", reason: "group" });
        const info = data as ServerInviteInfo;
        setLoad(info.invites_paused ? { state: "dead", reason: "paused" } : { state: "ready", data: info });
      })
      .catch((err) => {
        if (!alive) return;
        const error = toAuthError(err);
        setLoad({ state: "dead", reason: deadReason(error.type), error });
      });
    return () => {
      alive = false;
    };
  }, [client, code, setLoad]);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  const load: Load = !isInviteCode(code) ? { state: "dead", reason: "ended" } : answer?.key === key ? answer.load : { state: "loading" };
  return { load, retry };
}

/** One line of the "Inside" list or the approval note (web Inside li) */
function InsideRow({ icon, title, note, end, first }: { icon: IconName; title: string; note?: string; end?: string; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        minHeight: 48,
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.borderSoft,
      }}
    >
      <Icon name={icon} size={20} color={palette.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText autoDir size={15} line={22} weight="medium" color={palette.fg} numberOfLines={note ? undefined : 1}>
          {title}
        </AText>
        {note ? (
          <AText size={13} line={20} color={palette.muted}>
            {note}
          </AText>
        ) : null}
      </View>
      {end ? (
        <AText size={13} line={20} color={palette.muted}>
          {end}
        </AText>
      ) : null}
    </View>
  );
}

/** A page-sized notice: the link ended, invites are paused, or there is no connection */
function DeadNotice({ reason, error, onRetry }: { reason: DeadReason | "group"; error?: AuthError; onRetry: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const title =
    reason === "offline"
      ? t`We couldn't open this invite`
      : reason === "paused"
        ? t`This server isn't taking new people right now`
        : reason === "group"
          ? t`This invite is not for a server.`
          : t`This invite link has ended`;
  const text =
    reason === "offline"
      ? t`Check your connection and try again. The link itself may be fine.`
      : reason === "paused"
        ? t`The people who run it have paused invites for a while. Try the same link again later.`
        : reason === "group"
          ? undefined
          : t`Links can run out or be switched off. Ask the person who sent it for a new one.`;
  return (
    <View testID={`invite-dead-${reason}`} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24, paddingHorizontal: 16, gap: 12 }}>
      <Icon name={reason === "offline" ? "wifi-slash" : "link"} size={48} color={palette.muted} />
      <AText size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header" style={{ textAlign: "center" }}>
        {title}
      </AText>
      {text ? (
        <AText size={15} line={22} color={palette.fg2} style={{ textAlign: "center", maxWidth: 320 }}>
          {text}
        </AText>
      ) : null}
      {reason === "offline" && error && error.type !== "Network" ? (
        <View style={{ alignSelf: "stretch" }}>
          <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} />
        </View>
      ) : null}
      <View style={{ width: "100%", maxWidth: 320, marginTop: 12 }}>
        {reason === "offline" ? (
          <Button testID="invite-retry" label={t`Try again`} onPress={onRetry} fill />
        ) : (
          <Button testID="invite-discover" label={t`Find servers in Discover`} onPress={() => router.replace("/discover")} fill />
        )}
      </View>
    </View>
  );
}

/**
 * The server behind an invite, before joining (web: the invite page at phone
 * width and the Invite dialog): banner, icon, name, member count, who
 * invited, what it is about and what is inside, and one button fixed to the
 * foot of the screen. A server that asks first sends a request instead and
 * says so; a member gets "Open".
 */
export function InviteCard({ code, onJoined }: { code: string; onJoined?: (serverId: string) => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const cdn = useCdn();
  const insets = useSafeAreaInsets();
  const joined = useServerIds();
  const { load, retry } = useInvite(code);
  const [step, setStep] = useState<Step>("server");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  if (load.state === "loading") {
    return (
      <View testID="invite-loading" accessibilityState={{ busy: true }} style={{ flex: 1 }}>
        <View style={{ height: 132, backgroundColor: palette.field }} />
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={16} />
        </View>
      </View>
    );
  }
  if (load.state === "dead") return <DeadNotice reason={load.reason} error={load.error} onRetry={retry} />;

  const data = load.data;
  const member = joined.includes(data.server_id);
  const asksFirst = data.server_access === "Approval";
  const banner = fileUrl(cdn, "banners", data.server_banner);
  const name = data.server_name;

  const open = (id: string) => {
    if (onJoined) onJoined(id);
    else router.replace({ pathname: "/server/[id]", params: { id } });
  };

  async function join() {
    if (busy) return;
    if (member) return open(data.server_id);
    setBusy(true);
    setError(null);
    try {
      const invite = PublicChannelInvite.from(client, data as never) as ServerPublicInvite;
      await invite.join();
      open(data.server_id);
    } catch (err) {
      // a request was recorded: not a failure, and not a membership
      if (err instanceof JoinRequestCreated) setStep("requested");
      else setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }} testID="invite-card">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ height: 132, backgroundColor: palette.tonal, overflow: "hidden" }}>
          {banner ? (
            <Image source={{ uri: banner }} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 16, gap: 16 }}>
          <View style={{ gap: 8, marginTop: -52 }}>
            <View style={{ alignSelf: "flex-start", padding: 4, borderRadius: 14, backgroundColor: palette.frame }}>
              <Avatar url={fileUrl(cdn, "icons", data.server_icon)} name={name} size={88} square />
            </View>
            <AText autoDir size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header" testID="invite-server-name">
              {name}
            </AText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="users" size={16} color={palette.fg2} />
                <AText size={13} line={20} color={palette.fg2}>
                  {t`Members: ${memberCount(data.member_count ?? 0, i18n.locale)}`}
                </AText>
              </View>
              {!data.custom_link && data.user_name ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <Avatar url={fileUrl(cdn, "avatars", data.user_avatar)} name={data.user_name} size={20} />
                  <AText size={13} line={20} color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t`${data.user_name} invited you`}
                  </AText>
                </View>
              ) : null}
            </View>
          </View>
          {data.server_description ? (
            <AText autoDir autoAlign size={15} line={22} color={palette.fg2} numberOfLines={5}>
              {data.server_description}
            </AText>
          ) : null}
          {asksFirst && step === "server" && !member ? (
            <View style={{ borderWidth: 1, borderColor: palette.borderSoft, borderRadius: 10 }}>
              <InsideRow first icon="lock-simple" title={t`This server asks before letting people in`} note={t`Someone who runs it will look at your request.`} />
            </View>
          ) : !asksFirst && data.inside?.length ? (
            <View style={{ gap: 8 }}>
              <AText size={13} line={20} weight="medium" color={palette.muted}>
                {t`Inside`}
              </AText>
              <View style={{ borderWidth: 1, borderColor: palette.borderSoft, borderRadius: 10 }}>
                {data.inside.map((channel, i) => (
                  <InsideRow key={`${channel.name}-${i}`} first={i === 0} icon={channel.voice ? "speaker-high" : "hash"} title={channel.name} end={channel.voice ? t`Voice` : undefined} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* fixed to the foot of the screen, like the web's phone invite page */}
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 20 + insets.bottom,
          gap: 12,
          backgroundColor: palette.frame,
          borderTopWidth: 1,
          borderTopColor: palette.borderSoft,
        }}
      >
        {step === "requested" ? (
          <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={{ gap: 4 }} testID="invite-requested">
            <AText size={18} line={26} weight="bold" color={palette.header}>
              {t`Request sent`}
            </AText>
            <AText size={13} line={20} color={palette.fg2}>
              {t`You'll join this server as soon as someone who runs it approves you.`}
            </AText>
          </View>
        ) : null}
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        {step === "requested" ? (
          <AuthButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} testID="invite-close">
            {t`Close`}
          </AuthButton>
        ) : (
          <AuthButton status={busy ? "submitting" : "ready"} onPress={join} testID="invite-join">
            {member ? t`Open ${data.server_name}` : asksFirst ? t`Ask to join` : t`Join ${data.server_name}`}
          </AuthButton>
        )}
      </View>
    </View>
  );
}
