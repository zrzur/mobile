import { Trans, useLingui } from "@lingui/react/macro";
import type { PublicBot } from "@zrzur/sdk/solid";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { type AuthError, toAuthError } from "@/auth/flow";
import { errorDetails, errorText } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useServerIds } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { AuthButton, BackButton, ErrorBox } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { usePermissionTitles } from "@/ui/discover/labels";
import { SENSITIVE, askedGroups, askedPermissions, hasBit, inviteQuery, toggleBit, ulidTime } from "@/ui/discover/logic";
import { AText, Icon, KeyboardFooter, ScreenHeader, SearchField, Skeleton, keyboardScrollProps } from "@/ui/kit";
import { BotLabel } from "@/ui/profile/parts";

type Place = { id: string; name: string; icon?: string; server: boolean };

/** A date as the calendar reads it, in the person's language */
function DateText({ value }: { value: number }) {
  const { i18n } = useLingui();
  const { palette } = useTheme();
  let text = "";
  try {
    text = new Intl.DateTimeFormat(i18n.locale || "en", { dateStyle: "long" }).format(new Date(value));
  } catch {
    text = new Date(value).toDateString();
  }
  return (
    <AText size={13} line={20} weight="semibold" color={palette.fg}>
      {text}
    </AText>
  );
}

/** A tick box (20 px, radius 6), the same as sign-up's consent box */
function Tick({ checked }: { checked: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: checked ? "transparent" : palette.borderStrong,
        backgroundColor: checked ? palette.accent : palette.field,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? (
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke={palette.onAccent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Add a bot (web: AddBot dialog and /bot/{id}, zrzur.cc/b/{id}), in two
 * steps. First: who the bot is, what adding it allows, and the server (or
 * group) it goes to. Then, for a server: every permission it asks for, each
 * one untickable, and what we know about the bot. A group has no
 * permissions, so it is added from the first step.
 */
export default function AddBot() {
  const { id, permissions } = useLocalSearchParams<{ id: string; permissions?: string }>();
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const titles = usePermissionTitles();
  const serverIds = useServerIds();
  const [fetched, setFetched] = useState<{ id: string; bot?: PublicBot; error?: AuthError }>();
  const [step, setStep] = useState<"place" | "permissions">("place");
  const [chosen, setChosen] = useState<string>();
  const [filter, setFilter] = useState("");
  const [granted, setGranted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  const linkAsked = permissions ? Number(permissions) : undefined;
  const botId = String(id ?? "");
  const bot = fetched?.id === botId ? (fetched.bot ?? null) : null;
  const loadError = fetched?.id === botId ? (fetched.error ?? null) : null;
  const asked = bot ? (askedPermissions(bot, linkAsked) ?? 0) : 0;

  useEffect(() => {
    let alive = true;
    client.bots
      .fetchPublic(botId)
      .then((answer) => {
        if (!alive) return;
        setFetched({ id: botId, bot: answer });
        setGranted(askedPermissions(answer, linkAsked) ?? 0);
      })
      .catch((err) => alive && setFetched({ id: botId, error: toAuthError(err) }));
    return () => {
      alive = false;
    };
    // the link's permissions are read once with the bot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, botId]);

  const places = useMemo((): Place[] => {
    const botId = String(id ?? "");
    const servers = client.servers
      .toList()
      .filter((server) => server.havePermission("ManageServer") && !server.getMember(botId))
      .map((server) => ({ id: server.id, name: server.name, icon: server.iconURL, server: true }));
    const groups = client.channels
      .toList()
      .filter((channel) => channel.type === "Group" && !channel.recipientIds.has(botId))
      .map((channel) => ({ id: channel.id, name: channel.name ?? "", icon: channel.iconURL, server: false }));
    const q = foldSearch(filter.trim());
    return [...servers, ...groups].filter((place) => !q || foldSearch(place.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, i18n.locale));
    // serverIds: the list follows joins and leaves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, id, filter, serverIds, i18n.locale]);
  const place = places.find((p) => p.id === chosen);
  const toServer = !!place?.server;

  async function add() {
    if (!place || busy) return;
    setBusy(true);
    setError(null);
    try {
      // straight to the API so the ticked permissions are granted on a server
      await client.api.post(`/bots/${String(id)}/invite${inviteQuery(place.server, granted)}` as never, (place.server ? { server: place.id } : { group: place.id }) as never);
      if (place.server) router.replace({ pathname: "/server/[id]", params: { id: place.id } });
      else router.replace({ pathname: "/channel/[id]", params: { id: place.id } });
    } catch (err) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <ScreenHeader back={step === "permissions" && !busy ? () => setStep("place") : true} modal={step === "place"}>
      <AText size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
        {t`Add bot`}
      </AText>
    </ScreenHeader>
  );

  if (!bot) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
        {header}
        <View style={{ padding: 16, gap: 16 }}>
          {loadError ? (
            <ErrorBox message={errorText(i18n, loadError)} details={errorDetails(loadError)} />
          ) : (
            <View style={{ alignItems: "center", gap: 12 }} testID="add-bot-loading">
              <Skeleton width={64} height={64} round />
              <Skeleton width="50%" height={20} />
              <Skeleton width="80%" height={16} />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const groups = askedGroups(asked);
  const created = ulidTime(bot.id);
  const me = client.user;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right"]}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} {...keyboardScrollProps} testID={`add-bot-${step}`}>
        {/* the bot and you */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar url={bot.avatar?.previewUrl} name={bot.username} size={64} />
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.borderStrong }} />
            ))}
          </View>
          <Avatar url={me?.animatedAvatarURL} name={me?.displayName ?? me?.username} size={64} />
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AText autoDir size={18} line={26} weight="bold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }}>
              {bot.username}
            </AText>
            <BotLabel verified={bot.verified} />
          </View>
          <AText size={14} line={20} color={palette.fg2} style={{ textAlign: "center" }}>
            {step === "place" ? (
              t`wants to join one of your servers`
            ) : (
              <Trans>
                What it may do on <AText size={14} line={20} weight="semibold" color={palette.fg}>{place?.name}</AText>
              </Trans>
            )}
          </AText>
        </View>

        {step === "place" ? (
          <View style={{ gap: 12, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`This lets the bot:`}
            </AText>
            {[t`Join the server you choose`, t`Add its commands there`].map((line) => (
              <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="check-circle" size={18} color={palette.onlineText} />
                <AText size={14} line={20} color={palette.fg} style={{ flexShrink: 1 }}>
                  {line}
                </AText>
              </View>
            ))}
            {bot.description ? (
              <View style={{ maxHeight: 96, padding: 12, borderRadius: 10, backgroundColor: palette.frame, overflow: "hidden" }}>
                <AText autoDir autoAlign size={13} line={20} color={palette.fg2} numberOfLines={4}>
                  {bot.description}
                </AText>
              </View>
            ) : null}
            <View style={{ height: 1, backgroundColor: palette.divider }} />
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`Add to server`}
            </AText>
            <View style={{ flexDirection: "row" }}>
              <SearchField value={filter} onChange={setFilter} placeholder={t`Search for groups...`} testID="add-bot-search" />
            </View>
            {places.length || filter ? (
              <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: palette.frame }}>
                {places.map((p, i) => (
                  <Pressable
                    key={p.id}
                    testID={`add-bot-place-${p.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen === p.id }}
                    onPress={() => setChosen(p.id)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: palette.divider,
                      backgroundColor: chosen === p.id ? palette.navSelected : pressed ? palette.navHover : "transparent",
                    })}
                  >
                    <Avatar url={p.icon} name={p.name} size={24} square={!p.server} />
                    <AText autoDir size={15} line={20} color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                      {p.name}
                    </AText>
                    {chosen === p.id ? <Icon name="check" size={18} color={palette.accentText} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <AText size={13} line={20} color={palette.muted}>
                {t`You have no server to add it to: you need Manage Server there.`}
              </AText>
            )}
            <AText size={12} line={16} color={palette.muted}>
              {t`You need Manage Server on that server.`}
            </AText>
          </View>
        ) : (
          <View style={{ gap: 12, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
            {groups.length ? (
              <>
                <AText size={13} line={20} weight="semibold" color={palette.fg2}>
                  {t`On a server the bot gets:`}
                </AText>
                <AText size={12} line={16} color={palette.muted}>
                  {t`Untick anything you do not want to give it.`}
                </AText>
                {SENSITIVE.some((bit) => hasBit(asked, bit)) ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="warning" size={12} color={palette.warningText} />
                    <AText size={12} line={16} color={palette.muted} style={{ flexShrink: 1 }}>
                      {t`Lets the bot change the server or remove people.`}
                    </AText>
                  </View>
                ) : null}
                {groups.map((group) => (
                  <View key={group.id} style={{ gap: 2 }}>
                    <AText size={11} line={16} weight="bold" color={palette.muted}>
                      {titles.group(group.id)}
                    </AText>
                    {group.bits.map((bit) => (
                      <Pressable
                        key={bit}
                        testID={`add-bot-permission-${bit}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: hasBit(granted, bit) }}
                        onPress={() => setGranted((value) => toggleBit(value, bit))}
                        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
                      >
                        <Tick checked={hasBit(granted, bit)} />
                        <AText size={14} line={22} color={palette.fg} style={{ flexShrink: 1 }}>
                          {titles.name(bit)}
                        </AText>
                        {SENSITIVE.includes(bit) ? <Icon name="warning" size={14} color={palette.warningText} /> : null}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </>
            ) : (
              <AText size={13} line={20} color={palette.muted}>
                {t`The bot will not be granted any permissions.`}
              </AText>
            )}
            <View style={{ height: 1, backgroundColor: palette.divider }} />
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="shield-check" size={16} color={palette.fg2} />
                <AText size={13} line={20} color={palette.fg2} style={{ flexShrink: 1 }}>
                  {bot.verified ? t`Zrzur verified who runs this bot.` : t`This bot is not verified by Zrzur.`}
                </AText>
              </View>
              {bot.creator ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="user" size={16} color={palette.fg2} />
                  <AText size={13} line={20} color={palette.fg2} style={{ flexShrink: 1 }}>
                    <Trans>
                      Made by <AText size={13} line={20} weight="semibold" color={palette.fg}>{bot.creator.displayName ?? bot.creator.username}</AText>
                    </Trans>
                  </AText>
                </View>
              ) : null}
              {created ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="clock" size={16} color={palette.fg2} />
                  <AText size={13} line={20} color={palette.fg2} style={{ flexShrink: 1 }}>
                    <Trans>
                      Registered since <DateText value={created} />
                    </Trans>
                  </AText>
                </View>
              ) : null}
            </View>
          </View>
        )}
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
      </ScrollView>
      <KeyboardFooter style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
        {step === "permissions" ? <BackButton onPress={() => setStep("place")} /> : <BackButton label={t`Cancel`} onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />}
        {step === "place" && toServer ? (
          <AuthButton disabled={!place} onPress={() => setStep("permissions")} testID="add-bot-continue">
            {t`Continue`}
          </AuthButton>
        ) : (
          <AuthButton disabled={!place} status={busy ? "submitting" : "ready"} onPress={() => void add()} testID="add-bot-submit">
            {step === "place" && !place ? t`Continue` : t`Add bot`}
          </AuthButton>
        )}
      </KeyboardFooter>
    </SafeAreaView>
  );
}
