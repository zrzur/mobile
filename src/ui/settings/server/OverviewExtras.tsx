import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { toAuthError } from "@/auth/flow";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";

import {
  DISCOVER_CATEGORIES,
  DISCOVER_LANGUAGES,
  type DiscoverCategory,
  type DiscoverStatus,
  type FeaturesDraft,
  MAX_TAGS,
  type Stat,
  type SystemMessageKey,
  type SystemMessages,
  addTag,
  channelLabel,
  featuresBody,
  featuresFrom,
  inviteLink,
  isVanityName,
  languageName,
  listingBody,
  listingDirty,
  splitTagInput,
  statusKind,
  statusReason,
  toggleStat,
  vanityName,
  vanityState,
} from "../discovery";
import { Button } from "@/ui/kit";

import { ControlRow, InlineError, SettingsSection, SmallButton, Toggle } from "../parts";
import { FieldLabel as Label, Loading, Note, Notice as Banner, SelectField as SelectButton } from "./controls";
import { vanityLevel } from "../wings";
import { PickerSheet } from "./Channels";
import { useBillingPlans } from "./Wings";
import { openExternal } from "@/ui/kit/openLink";
import { copyToClipboard } from "@/ui/kit/share";
import { editServer } from "@/ui/server/serverEdit";

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

type DiscoverRequest = { status: DiscoverStatus; tags?: string[]; category?: string | null; language?: string | null };

/** Overview › Discovery (web: Discoverable, full page, owner only) */
export function DiscoverySection({ server }: { server: Server }) {
  const { t } = useLingui();
  const selfId = useSelfId();
  const owner = useFields(server, (v) => v.ownerId) === selfId;
  return (
    <SettingsSection title={t`Discovery`} description={t`Whether people can find the server in Discover.`}>
      {owner ? (
        <Discoverable server={server} />
      ) : (
        <Note>{t`Only the owner of the server can change how it appears in Discover.`}</Note>
      )}
    </SettingsSection>
  );
}

function Discoverable({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const locale = intlLocale(i18n.locale);
  // undefined: loading, null: never submitted
  const [request, setRequest] = useState<DiscoverRequest | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string>();
  const [draft, setDraft] = useState<{ category: string; language: string; tags: string[] } | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [armed, setArmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [languagePicker, setLanguagePicker] = useState(false);
  const [tick, setTick] = useState(0);
  const card = useFields(server, (v) => ({
    name: v.name,
    description: v.description ?? "",
    icon: v.iconURL,
    banner: v.bannerURL,
    verified: (Number(v.flags ?? 0) & 3) !== 0,
    members: v.approximateMemberCount ?? 0,
  }));

  useEffect(() => {
    let live = true;
    client.api
      .get(`/servers/${server.id}/discover` as never)
      .then((r) => live && setRequest(r as unknown as DiscoverRequest))
      .catch((err) => {
        if (!live) return;
        if (toAuthError(err).type === "NotFound") setRequest(null);
        else setLoadError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [client, server, tick]);

  const categoryLabel: Record<DiscoverCategory, string> = {
    gaming: t`Gaming`,
    community: t`Community`,
    education: t`Education`,
    technology: t`Technology`,
    art: t`Art & Creativity`,
    music: t`Music`,
    entertainment: t`Entertainment`,
    anime: t`Anime & Manga`,
    sports: t`Sports`,
    science: t`Science`,
    languages: t`Languages`,
    other: t`Other`,
  };

  if (loadError) {
    return (
      <View style={{ gap: 12 }}>
        <Banner icon="warning-circle" tone={palette.danger} strong={t`Can't get discover request status right now`} text={loadError} testID="discover-load-error" />
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            label={t`Try again`}
            variant="tonal"
            size="sm"
            icon="arrow-clockwise"
            onPress={() => {
              setLoadError(undefined);
              setTick((n) => n + 1);
            }}
          />
        </View>
      </View>
    );
  }
  if (request === undefined || !card) return <Loading />;

  const kind = statusKind(request?.status);
  const reasonText = statusReason(request?.status);
  const reason = reasonText ? t`Reason: ${reasonText}` : undefined;
  const base = { category: request?.category ?? "", language: request?.language ?? "", tags: request?.tags ?? [] };
  const d = draft ?? base;
  const dirty = listingDirty(base, d);
  const listed = kind === "pending" || kind === "review" || kind === "approved";
  const set = (patch: Partial<typeof d>) => {
    setDraft({ ...d, ...patch });
    setSaved(false);
  };
  const pushTag = (raw: string) => {
    setTagInput("");
    const result = addTag(d.tags, raw);
    if (result.invalid) return setError(t`Tags use 2–24 letters, numbers, - or _.`);
    setError(undefined);
    if (result.tags !== d.tags) set({ tags: result.tags });
  };

  const run = async (action: () => Promise<unknown>, after?: (result: unknown) => void) => {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await action();
      after?.(result);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    run(
      () => client.api.put(`/servers/${server.id}/discover` as never, listingBody(d) as never),
      (r) => {
        setRequest(r as unknown as DiscoverRequest);
        setDraft(null);
      },
    );
  const save = () =>
    run(
      () => client.api.patch(`/servers/${server.id}/discover` as never, listingBody(d) as never),
      (r) => {
        if (r) setRequest(r as unknown as DiscoverRequest);
        setDraft(null);
        setSaved(true);
      },
    );
  const remove = () => {
    if (!armed) return setArmed(true);
    void run(
      () => client.api.delete(`/servers/${server.id}/discover` as never),
      () => {
        setRequest(null);
        setDraft(null);
        setArmed(false);
      },
    );
  };

  const banner = (() => {
    switch (kind) {
      case "pending":
      case "review":
        return <Banner icon="hourglass" tone={palette.accentText} strong={t`Your server is under review`} text={t`You can still change the details below while you wait.`} testID="discover-status" />;
      case "approved":
        return <Banner icon="check-circle" tone={palette.onlineText} strong={t`This server is listed on Discover`} text={t`Changes to the details below show up right away. You can remove it at any time.`} extra={reason} testID="discover-status" />;
      case "denied":
        return <Banner icon="x-circle" tone={palette.warningText} strong={t`Your discover request has been denied`} text={t`You can request again below`} extra={reason} testID="discover-status" />;
      case "removed":
        return <Banner icon="prohibit" tone={palette.danger} strong={t`Your discover request has been removed`} text={t`Contact support for more information.`} extra={reason} testID="discover-status" />;
      default:
        return <Banner icon="compass" tone={palette.iconNeutral} strong={t`Your server isn't on Discover`} text={t`Let people find and join your server. A moderator reviews every request, and you can take it off at any time.`} testID="discover-status" />;
    }
  })();

  const languages = [{ value: "", label: t`Not set` }, ...DISCOVER_LANGUAGES.map((code) => ({ value: code as string, label: languageName(code, locale) }))];
  const tagCount = `${d.tags.length}/${MAX_TAGS}`;
  const members = new Intl.NumberFormat(locale).format(card.members);

  return (
    <View style={{ gap: 16 }} testID="discover-panel">
      {banner}
      {kind !== "removed" ? (
        <>
          <View style={{ gap: 8 }}>
            <Label hint={t`Where people browsing Discover will find it.`}>{t`Category`}</Label>
            <View accessibilityLabel={t`Category`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DISCOVER_CATEGORIES.map((c) => {
                const on = d.category === c;
                return (
                  <Pressable
                    key={c}
                    testID={`discover-category-${c}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: busy }}
                    aria-checked={on}
                    disabled={busy}
                    onPress={() => set({ category: on ? "" : c })}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      justifyContent: "center",
                      opacity: busy ? 0.5 : 1,
                      borderWidth: 1,
                      borderColor: on ? "transparent" : pressed ? palette.borderStrong : palette.borderSubtle,
                      backgroundColor: on ? (pressed ? palette.accentPressed : palette.accent) : palette.field,
                    })}
                  >
                    <AText size={14} line={20} weight="medium" color={on ? palette.onAccent : palette.fg2}>
                      {categoryLabel[c]}
                    </AText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Label>{t`Main language`}</Label>
            <SelectButton label={t`Main language`} value={languages.find((l) => l.value === d.language)?.label ?? d.language} disabled={busy} onPress={() => setLanguagePicker(true)} testID="discover-language" />
          </View>

          <View style={{ gap: 8 }}>
            <Label counter={tagCount} hint={t`Up to five words people might search for. Press Enter to add.`}>
              {t`Tags`}
            </Label>
            {d.tags.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8 }}>
                {d.tags.map((tag) => (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={t`Remove tag ${tag}`}
                    disabled={busy}
                    onPress={() => set({ tags: d.tags.filter((x) => x !== tag) })}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    {({ pressed }) => (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingStart: 12, paddingEnd: 8, borderRadius: 8, backgroundColor: pressed ? palette.tonalHover : palette.tonal }}>
                        <AText size={13} line={20} weight="medium" color={palette.fg}>
                          {`#${tag}`}
                        </AText>
                        <Icon name="x" size={14} color={palette.fg2} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {d.tags.length < MAX_TAGS ? (
              <TextField
                label={t`Tags`}
                value={tagInput}
                placeholder={t`Add a tag`}
                maxLength={25}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="done"
                submitBehavior="submit"
                testID="discover-tag-input"
                onChangeText={(v) => {
                  const { done, rest } = splitTagInput(v);
                  if (done !== undefined) pushTag(done);
                  else setTagInput(rest);
                }}
                onSubmitEditing={() => pushTag(tagInput)}
                onBlur={() => tagInput && pushTag(tagInput)}
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === "Backspace" && !tagInput && d.tags.length) set({ tags: d.tags.slice(0, -1) });
                }}
              />
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Note>{t`Every listing gets its own public page on discover.zrzur.com. Anyone can open it without an account and search engines index it, with a preview image and the approximate member and online counts.`}</Note>
            <Note>{t`The name, icon, banner and description come from your server's Overview settings.`}</Note>
          </View>

          <View style={{ gap: 8 }}>
            <Label hint={t`This is how it will look on Discover.`}>{t`Preview`}</Label>
            <View testID="discover-preview" style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.field, borderWidth: 1, borderColor: palette.borderSoft }}>
              <View style={{ height: 88, backgroundColor: palette.tonal }}>{card.banner ? <Image source={{ uri: card.banner }} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : null}</View>
              <View style={{ padding: 16, paddingTop: 0, gap: 8 }}>
                <View style={{ marginTop: -24, alignSelf: "flex-start", borderRadius: 14, borderWidth: 3, borderColor: palette.field }}>
                  <Avatar url={card.icon} name={card.name} size={48} square />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <AText autoDir size={16} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {card.name}
                  </AText>
                  {card.verified ? <Icon name="seal-check" size={16} color={palette.accentText} /> : null}
                </View>
                {card.description ? (
                  <AText autoDir size={13} line={18} color={palette.fg2} numberOfLines={3}>
                    {card.description}
                  </AText>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {d.category && d.category in categoryLabel ? <Chip>{categoryLabel[d.category as DiscoverCategory]}</Chip> : null}
                  {d.language ? <Chip>{languageName(d.language, locale)}</Chip> : null}
                  {d.tags.map((tag) => (
                    <Chip key={tag}>{`#${tag}`}</Chip>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="users" size={14} color={palette.iconMuted} />
                  <AText size={12} line={16} color={palette.muted}>
                    {members}
                  </AText>
                </View>
              </View>
            </View>
          </View>
        </>
      ) : null}

      <InlineError message={error} />
      {saved && !dirty ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLiveRegion="polite">
          <Icon name="check-circle" size={16} color={palette.onlineText} />
          <AText size={13} line={18} color={palette.fg2}>
            {t`Saved`}
          </AText>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {kind === "none" || kind === "denied" ? <SmallButton primary label={kind === "denied" ? t`Submit again` : t`Submit to Discover`} disabled={busy} testID="discover-submit" onPress={() => void submit()} /> : null}
        {listed && dirty ? (
          <>
            <SmallButton label={t`Reset`} disabled={busy} onPress={() => setDraft(null)} />
            <SmallButton primary label={busy ? t`Saving…` : t`Save changes`} disabled={busy} testID="discover-save" onPress={() => void save()} />
          </>
        ) : null}
        {kind === "approved" ? <SmallButton label={t`View on Discover`} testID="discover-view" onPress={() => void openExternal(`https://discover.zrzur.com/${server.id}`)} /> : null}
        {listed ? (
          <Button
            testID="discover-remove"
            size="sm"
            variant={armed ? "danger" : "tonal"}
            disabled={busy}
            onPress={remove}
            label={armed ? t`Click again to confirm` : kind === "approved" ? t`Remove from Discover` : t`Cancel request`}
          />
        ) : null}
      </View>

      <PickerSheet visible={languagePicker} title={t`Main language`} value={d.language} options={languages} onPick={(v) => set({ language: v })} onClose={() => setLanguagePicker(false)} />
    </View>
  );
}

function Chip({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.tonal }}>
      <AText size={12} line={16} color={palette.fg2}>
        {children}
      </AText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Invites and sharing
// ---------------------------------------------------------------------------

/** Overview › Invites and sharing (web: VanityInvite) */
export function InvitesSharingSection({ server }: { server: Server }) {
  const { t } = useLingui();
  const { plans, error } = useBillingPlans();
  const manage = server.havePermission("ManageServer");
  const free = !!plans && !plans.available;
  const required = plans ? vanityLevel(plans.levels) : undefined;
  if (plans && !free && !required) return null;
  return (
    <SettingsSection title={t`Invites and sharing`} description={t`A short link people remember.`} readOnly={manage ? undefined : t`Manage server`}>
      {error ? <InlineError message={error} /> : !plans ? <Loading /> : <VanityInvite server={server} free={free} required={required} />}
    </SettingsSection>
  );
}

function VanityInvite({ server, free, required }: { server: Server; free: boolean; required?: { level: number; supercharges: number } }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const locale = intlLocale(i18n.locale);
  const s = useFields(server, (v) => ({
    code: v.vanityInvite?.code ?? "",
    channel: v.vanityInvite?.channel ?? "",
    since: v.vanityInvite?.belowLevelSince ? v.vanityInvite.belowLevelSince.getTime() : 0,
    exists: !!v.vanityInvite,
    level: v.supercharge?.level ?? 0,
    count: v.supercharge?.count ?? 0,
  }));
  const channelJson = useSolid(useCallback(() => JSON.stringify(server.channels.filter((c) => c.type === "TextChannel").map((c) => ({ value: c.id, label: `#${c.name}` }))), [server]));
  const textChannels = useMemo(() => JSON.parse(channelJson) as { value: string; label: string }[], [channelJson]);
  const [code, setCode] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [picker, setPicker] = useState(false);
  const [now, setNow] = useState(0);
  const [focused, setFocused] = useState(false);

  // the clock is read after render (the grace and pause dates depend on it)
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => live && setNow(Date.now()));
    return () => {
      live = false;
    };
  }, [s?.since]);

  if (!s) return null;
  const level = s.level;
  const unlocked = free || (!!required && level >= required.level);
  const typed = code ?? s.code;
  const pickedChannel = channel ?? s.channel;
  const name = vanityName(typed);
  const problem = name && !isVanityName(name) ? t`Use 3–32 letters, numbers or single hyphens.` : undefined;
  const changed = name !== s.code || pickedChannel !== s.channel;
  const canSave = unlocked && !!name && !problem && changed && !pending;
  const state = now ? vanityState(s.since ? new Date(s.since) : undefined, new Date(now)) : { kind: "active" as const };
  const medium = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
  const requiredLevel = required?.level ?? 0;
  const supercharges = required?.supercharges ?? 0;
  const count = s.count;

  const save = async () => {
    if (!canSave) return;
    setPending(true);
    setError(undefined);
    try {
      await server.claimVanityInvite(name, pickedChannel || undefined);
      setCode(null);
      setChannel(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!armed) return setArmed(true);
    setPending(true);
    setError(undefined);
    try {
      await server.removeVanityInvite();
      setCode(null);
      setChannel(null);
      setArmed(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };
  const copy = async () => {
    await copyToClipboard(inviteLink(s.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const badge = s.exists ? (state.kind === "grace" ? { label: t`Ending soon`, tone: palette.warningText } : state.kind === "paused" || state.kind === "release" ? { label: t`Paused`, tone: palette.warningText } : { label: t`Active`, tone: palette.onlineText }) : null;

  return (
    <View style={{ gap: 16 }} testID="vanity-invite">
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <AText size={16} line={22} weight="semibold" color={palette.header}>
            {t`Custom invite link`}
          </AText>
          {badge ? (
            <View testID="vanity-status" style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: badge.tone }}>
              <AText size={12} line={16} weight="semibold" color={badge.tone}>
                {badge.label}
              </AText>
            </View>
          ) : null}
        </View>
        <AText size={13} line={18} color={palette.muted}>
          {free ? t`One short, memorable link for your server, like zrzur.cc/your-name.` : t`One short, memorable link for your server, like zrzur.cc/your-name. Unlocked at Wings level ${requiredLevel}.`}
        </AText>
      </View>

      {!unlocked && !s.exists ? (
        <RowGroup>
          <ControlRow
            first
            icon="lock-simple"
            title={t`Reach level ${requiredLevel} to unlock (${supercharges} Wings)`}
            description={t`This server is at level ${level} with ${count} Wings.`}
            control={<SmallButton label={t`See levels`} testID="vanity-see-levels" onPress={() => router.push({ pathname: "/server-section/[id]/[section]", params: { id: server.id, section: "wings" } })} />}
          />
        </RowGroup>
      ) : (
        <View style={{ gap: 12 }}>
          {state.kind === "grace" ? (
            <Banner
              icon="warning"
              tone={palette.warningText}
              strong={(() => {
                const date = medium(state.ends);
                return t`This server is below level ${requiredLevel}. The link keeps working until ${date}, then pauses.`;
              })()}
            />
          ) : null}
          {state.kind === "paused" ? (
            <Banner
              icon="warning"
              tone={palette.warningText}
              strong={(() => {
                const date = medium(state.releasedAt);
                return t`The link is paused. The name stays yours until ${date}. Reach level ${requiredLevel} again to turn it back on.`;
              })()}
            />
          ) : null}

          <View style={{ gap: 8 }}>
            <AText size={13} line={20} weight="semibold" color={focused ? palette.fg : palette.fg2}>
              {t`Link name`}
            </AText>
            {/* the address reads left to right in every language */}
            <View
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                flexDirection: "row",
                direction: "ltr",
                alignItems: "center",
                borderRadius: 10,
                backgroundColor: palette.field,
                borderWidth: 1,
                borderColor: problem ? palette.danger : focused ? palette.accent : palette.fieldBorder,
                opacity: !unlocked || pending ? 0.6 : 1,
              }}
            >
              <AText size={16} line={20} color={palette.muted} style={{ writingDirection: "ltr" }}>
                zrzur.cc/
              </AText>
              <TextInput
                testID="vanity-name"
                accessibilityLabel={t`Link name`}
                aria-invalid={!!problem}
                value={typed}
                onChangeText={setCode}
                editable={unlocked && !pending}
                maxLength={32}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  setArmed(false);
                }}
                placeholderTextColor={palette.muted}
                selectionColor={palette.accent}
                style={{ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 12, paddingHorizontal: 0, fontSize: 16, lineHeight: 20, color: palette.fg, fontFamily: fontFamily(i18n.locale), writingDirection: "ltr", textAlign: "left" }}
              />
            </View>
            {problem ? <InlineError message={problem} /> : (
              <AText size={12} line={16} color={palette.muted}>
                {t`Letters, numbers and single hyphens. 3–32 characters.`}
              </AText>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`New members land in`}
            </AText>
            <SelectButton
              label={t`New members land in`}
              value={textChannels.find((c) => c.value === pickedChannel)?.label ?? t`First channel everyone can read`}
              disabled={!unlocked || pending}
              onPress={() => setPicker(true)}
              testID="vanity-channel"
            />
          </View>

          <InlineError message={error} />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <SmallButton primary label={s.exists ? t`Save` : t`Claim link`} disabled={!canSave} testID="vanity-save" onPress={() => void save()} />
            {s.exists ? <SmallButton label={copied ? t`Copied` : t`Copy link`} testID="vanity-copy" onPress={() => void copy()} /> : null}
            {s.exists ? (
              <Button testID="vanity-remove" size="sm" variant={armed ? "danger" : "ghost"} disabled={pending} onPress={() => void remove()} label={armed ? t`Press again to remove` : t`Remove`} />
            ) : null}
          </View>
        </View>
      )}
      <PickerSheet visible={picker} title={t`New members land in`} value={pickedChannel} options={[{ value: "", label: t`First channel everyone can read` }, ...textChannels]} onPick={setChannel} onClose={() => setPicker(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/** Overview › Features (web: rules channel, system messages, counters) with its own Reset / Save */
export function FeaturesSection({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { plans } = useBillingPlans();
  const manage = server.havePermission("ManageServer");
  const s = useFields(server, (v) => ({
    rules: v.rulesChannelId ?? "",
    messages: JSON.stringify(v.systemMessages ?? {}),
    stats: (v.stats ?? []) as Stat[],
  }));
  const channelJson = useSolid(useCallback(() => JSON.stringify(server.channels.filter((c) => !c.isVoice).map((c) => ({ value: c.id, label: channelLabel(c.name) }))), [server]));
  const channels = useMemo(() => JSON.parse(channelJson) as { value: string; label: string }[], [channelJson]);
  const [draft, setDraft] = useState<FeaturesDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [picker, setPicker] = useState<"rules" | SystemMessageKey | null>(null);

  if (!s) return null;
  const current = JSON.parse(s.messages) as SystemMessages;
  const stored = featuresFrom(s.rules, current, s.stats);
  const d = draft ?? stored;
  const body = featuresBody(stored, d, current);
  const dirty = !!body;

  const save = async () => {
    if (!body) return;
    setSaving(true);
    setError(undefined);
    try {
      await editServer(server, body as Record<string, unknown>);
      setDraft(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const noneLabel = (key: "rules" | SystemMessageKey) => (key === "rules" ? t`None` : t`Off`);
  const valueOf = (key: "rules" | SystemMessageKey) => (key === "rules" ? d.rules : d.messages[key]);
  const labelOf = (key: "rules" | SystemMessageKey) => {
    const v = valueOf(key);
    return v === "none" ? noneLabel(key) : (channels.find((c) => c.value === v)?.label ?? noneLabel(key));
  };
  const setValue = (key: "rules" | SystemMessageKey, value: string) => setDraft(key === "rules" ? { ...d, rules: value } : { ...d, messages: { ...d.messages, [key]: value } });

  const rows: { key: "rules" | SystemMessageKey; icon: IconName; title: string; description?: string }[] = [
    { key: "rules", icon: "book-check", title: t`Rules channel`, description: t`Pinned at the top of the channel list, with a "Read the rules" button in the Lobby.` },
    { key: "user_joined", icon: "user-plus", title: t`Member joined` },
    { key: "user_left", icon: "user-minus", title: t`Member left` },
    { key: "user_kicked", icon: "sign-out", title: t`Member kicked` },
    { key: "user_banned", icon: "prohibit", title: t`Member banned` },
  ];
  const counters: { stat: Stat; icon: IconName; title: string }[] = [
    { stat: "Members", icon: "users", title: t`Members` },
    { stat: "Channels", icon: "hash", title: t`Channels` },
    { stat: "Roles", icon: "shield", title: t`Roles` },
    ...(plans?.available ? [{ stat: "Wings" as Stat, icon: "lightning" as IconName, title: t({ message: "Wings", context: "server-settings" }) }] : []),
  ];
  const pickerTitle = picker ? rows.find((r) => r.key === picker)?.title ?? "" : "";

  return (
    <SettingsSection title={t`Features`} description={t`The rules channel, system messages and counters.`} readOnly={manage ? undefined : t`Manage server`}>
      <View style={{ gap: 24 }} testID="features-form">
        <View style={{ gap: 8 }}>
          <AText size={16} line={22} weight="semibold" color={palette.header}>
            {t`Special channels`}
          </AText>
          <AText size={13} line={18} color={palette.muted}>
            {t`Where your rules live, and where an automatic message is posted when members join, leave or are removed.`}
          </AText>
          <RowGroup>
            {rows.map((r, i) => (
              <ControlRow
                key={r.key}
                first={i === 0}
                icon={r.icon}
                title={r.title}
                description={r.description}
                control={<SmallButton label={labelOf(r.key)} accessibilityLabel={`${r.title}: ${labelOf(r.key)}`} disabled={!manage || saving} testID={`features-${r.key}`} onPress={() => setPicker(r.key)} />}
              />
            ))}
          </RowGroup>
        </View>

        <View style={{ gap: 8 }}>
          <AText size={16} line={22} weight="semibold" color={palette.header}>
            {t`Counters`}
          </AText>
          <AText size={13} line={18} color={palette.muted}>
            {t`Live counters at the top of the channel list. They update by themselves and nobody can open them.`}
          </AText>
          <RowGroup>
            {counters.map((c, i) => {
              const on = d.stats.includes(c.stat);
              return (
                <Pressable
                  key={c.stat}
                  accessibilityRole="switch"
                  accessibilityLabel={c.title}
                  accessibilityState={{ checked: on, disabled: !manage || saving }}
                  aria-checked={on}
                  disabled={!manage || saving}
                  testID={`features-stat-${c.stat}`}
                  onPress={() => setDraft({ ...d, stats: toggleStat(d.stats, c.stat) })}
                >
                  <ControlRow first={i === 0} icon={c.icon} title={c.title} control={<Toggle label={c.title} value={on} disabled={!manage || saving} onChange={() => setDraft({ ...d, stats: toggleStat(d.stats, c.stat) })} />} />
                </Pressable>
              );
            })}
          </RowGroup>
        </View>

        {dirty || error ? (
          <View style={{ gap: 8 }}>
            <InlineError message={error} />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <SmallButton
                label={t`Reset`}
                disabled={saving}
                onPress={() => {
                  setDraft(null);
                  setError(undefined);
                }}
              />
              <SmallButton label={saving ? t`Saving…` : t`Save changes`} primary testID="features-save" disabled={!dirty || saving} onPress={() => void save()} />
            </View>
          </View>
        ) : null}
      </View>
      <PickerSheet
        visible={!!picker}
        title={pickerTitle}
        value={picker ? valueOf(picker) : "none"}
        options={[{ value: "none", label: picker ? noneLabel(picker) : t`None` }, ...channels]}
        onPick={(v) => picker && setValue(picker, v)}
        onClose={() => setPicker(null)}
      />
    </SettingsSection>
  );
}

