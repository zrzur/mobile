import { useLingui } from "@lingui/react/macro";
import type { MFATicket, Server } from "@zrzur/sdk/solid";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { describeError } from "@/auth/errorText";
import { Icon } from "@/ui/Icon";

import { canTransferTo, confirmsName } from "../accountLogic";
import { DialogSheet, useMfaTicket } from "../MfaFlow";
import { Choices, ConfirmDialog, ControlRow, SaveBar, SettingsPage, SettingsSection, Toggle } from "../parts";
import { Button } from "@/ui/kit";
import { DiscoverySection, FeaturesSection, InvitesSharingSection } from "./OverviewExtras";
import { TicketsSection } from "./Tickets";
import { editServer } from "@/ui/server/serverEdit";

type Picked = { uri: string; name: string; type: string } | null | undefined;

async function pick(aspect: [number, number]): Promise<Picked> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect, quality: 0.92 });
  if (result.canceled) return undefined;
  const a = result.assets[0];
  return { uri: a.uri, name: a.fileName ?? "image.jpg", type: a.mimeType ?? "image/jpeg" };
}

/** Overview (web: server settings › Overview, phone order) */
export function OverviewPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const s = useFields(server, (v) => ({
    name: v.name,
    description: v.description ?? "",
    icon: v.iconURL,
    banner: v.bannerURL,
    threadsOff: v.threadsDisabled,
    forumsOff: v.forumsDisabled,
    events: v.eventsEnabled,
    lobby: !!v.lobby?.enabled,
    notify: v.defaultNotifications ?? "All",
    owner: v.ownerId,
  }));
  const manage = server.havePermission("ManageServer");
  const owner = s?.owner === selfId;

  // the profile form: edits kept here until Save changes
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [icon, setIcon] = useState<Picked>(undefined);
  const [banner, setBanner] = useState<Picked>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!s) return null;
  const shownName = name ?? s.name;
  const shownDescription = description ?? s.description;
  const dirty = (name !== null && name !== s.name) || (description !== null && description !== s.description) || icon !== undefined || banner !== undefined;

  const reset = () => {
    setName(null);
    setDescription(null);
    setIcon(undefined);
    setBanner(undefined);
    setError(undefined);
  };

  const save = async () => {
    if (!shownName.trim()) return setError(t`Please fill in this field.`);
    setSaving(true);
    setError(undefined);
    try {
      const remove: string[] = [];
      const data: Record<string, unknown> = {};
      if (name !== null && name.trim() !== s.name) data.name = name.trim();
      if (description !== null) {
        if (description.trim()) data.description = description.trim();
        else remove.push("Description");
      }
      if (icon === null) remove.push("Icon");
      else if (icon) data.icon = await client.uploadFile("icons", icon as unknown as File);
      if (banner === null) remove.push("Banner");
      else if (banner) data.banner = await client.uploadFile("banners", banner as unknown as File);
      if (remove.length) data.remove = remove;
      await editServer(server, data as Record<string, unknown>);
      reset();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const auto = (fn: () => Promise<unknown>) => () => {
    fn().catch(() => {});
  };

  const iconUrl = icon === null ? undefined : icon ? icon.uri : s.icon;
  const bannerUrl = banner === null ? undefined : banner ? banner.uri : s.banner;

  return (
    <SettingsPage
      title={t`Overview`}
      description={t`How the server looks, how people find and join it, and its main switches.`}
      testID="server-overview"
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onReset={reset} onSave={save} />}
    >
      <SettingsSection title={t`Server profile`} description={t`The name, picture and description people see.`} readOnly={manage ? undefined : t`Manage server`}>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t`Change server icon`} onPress={async () => setIcon(await pick([1, 1]))}>
              <Avatar url={iconUrl} name={shownName} size={96} square />
            </Pressable>
            <View style={{ flex: 1, alignItems: "flex-start" }}>
              <Pressable accessibilityRole="button" testID="overview-icon-change" onPress={async () => setIcon(await pick([1, 1]))} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: pressed ? palette.navHover : "transparent" })}>
                <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                  {t`Change server icon`}
                </AText>
              </Pressable>
              {iconUrl ? (
                <Pressable accessibilityRole="button" onPress={() => setIcon(null)} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: pressed ? palette.navHover : "transparent" })}>
                <AText size={14} line={20} weight="semibold" color={palette.danger}>
                  {t`Remove server icon`}
                </AText>
              </Pressable>
              ) : null}
            </View>
          </View>
          <TextField label={t`Server name`} value={shownName} onChangeText={setName} maxLength={32} testID="overview-name" helper={`${shownName.length}/32`} />
          <TextField
            label={t`Description`}
            value={shownDescription}
            onChangeText={setDescription}
            placeholder={t`This server is about...`}
            helper={t`Shown in the server info and invites. Markdown is supported.`}
            maxLength={1024}
            multiline
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
          <View style={{ gap: 8 }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`Server banner`}
            </AText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t`Change server banner`}
              onPress={async () => setBanner(await pick([16, 9]))}
              style={{ aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}
            >
              {bannerUrl ? <Image source={{ uri: bannerUrl }} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : <Icon name="image" size={28} color={palette.muted} />}
            </Pressable>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 24 }}>
              <Pressable accessibilityRole="button" testID="overview-banner-change" onPress={async () => setBanner(await pick([16, 9]))} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: pressed ? palette.navHover : "transparent" })}>
                <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                  {t`Change server banner`}
                </AText>
              </Pressable>
              {bannerUrl ? (
                <Pressable accessibilityRole="button" onPress={() => setBanner(null)} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: pressed ? palette.navHover : "transparent" })}>
                <AText size={14} line={20} weight="semibold" color={palette.danger}>
                  {t`Remove server banner`}
                </AText>
              </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </SettingsSection>

      {/* web order: profile, discovery, invites, features, then the switches */}
      <DiscoverySection server={server} />
      <InvitesSharingSection server={server} />
      <FeaturesSection server={server} />

      <SettingsSection title={t`Threads and forums`} description={t`Turn them on or off for this server.`} readOnly={manage ? undefined : t`Manage server`}>
        <RowGroup>
          <ControlRow
            first
            title={t`Threads`}
            description={t`Side conversations in the text channels of this server.`}
            control={<Toggle label={t`Threads`} value={!s.threadsOff} onChange={(on) => auto(() => editServer(server, { threads_disabled: !on }))()} testID="toggle-threads" />}
          />
          <ControlRow
            title={t`Forums`}
            description={t`Channels of posts with a title and tags in this server.`}
            control={<Toggle label={t`Forums`} value={!s.forumsOff} onChange={(on) => auto(() => editServer(server, { forums_disabled: !on }))()} />}
          />
        </RowGroup>
        <AText size={13} line={18} color={palette.muted} style={{ marginTop: 8 }}>
          {t`When one is off, nobody can add to it, the owner included. Nothing is deleted: everything already there can still be read.`}
        </AText>
      </SettingsSection>

      <SettingsSection title={t`Events and lobby`} description={t`Rows at the top of the channel list. Both start off.`} readOnly={manage ? undefined : t`Manage server`}>
        <RowGroup>
          <ControlRow
            first
            title={t`Events`}
            description={t`Plan game nights and meetups; an Events row shows for everyone.`}
            control={<Toggle label={t`Events`} value={s.events} onChange={(on) => auto(() => server.setEventsEnabled(on))()} />}
          />
          <ControlRow
            title={t`Lobby`}
            description={t`A welcome page; a Lobby row shows for everyone and the server opens on it.`}
            control={<Toggle label={t`Lobby`} value={s.lobby} onChange={(on) => auto(() => editServer(server, (s) => ({ lobby: { ...(s.lobby ?? {}), enabled: on } })))()} />}
          />
        </RowGroup>
        <AText size={13} line={18} color={palette.muted} style={{ marginTop: 8 }}>
          {t`Turning one off hides its row and keeps what you made: planned events and the lobby design stay saved.`}
        </AText>
      </SettingsSection>

      <TicketsSection server={server} />

      <SettingsSection title={t`Default notifications`} description={t`What members are notified about until they choose for themselves.`} readOnly={manage ? undefined : t`Manage server`}>
        <Choices
          label={t`Notify members about`}
          value={s.notify as "All" | "Mentions"}
          disabled={!manage}
          onChange={(level) => auto(() => server.setDefaultNotifications(level))()}
          options={[
            { value: "All", title: t`All messages`, text: t`Members are notified about every message.` },
            { value: "Mentions", title: t`Mentions only`, text: t`Members are notified only when someone mentions them.` },
          ]}
        />
        <AText size={13} line={18} color={palette.muted} style={{ marginTop: 8 }}>
          {t`Each member can still choose their own setting.`}
        </AText>
      </SettingsSection>

      {owner ? <ServerOwnership server={server} /> : null}
    </SettingsPage>
  );
}

type Candidate = { id: string; name: string; username: string; avatar?: string };

/**
 * Overview › Danger zone (owner only, web ServerOwnership): give the server
 * to a member, or delete it. Both ask for an MFA ticket first.
 */
function ServerOwnership({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { request, element: mfaElement } = useMfaTicket();
  const s = useFields(server, (v) => ({ name: v.name, ownerId: v.ownerId }));
  const [dialog, setDialog] = useState<"transfer" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // transfer: member search, debounced
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchId = useRef(0);
  // a cancelled two-step code keeps the delete dialog open
  const keepOpen = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!s) return null;
  const serverName = s.name;
  const ownerId = s.ownerId;

  const search = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    const q = value.trim();
    const id = ++searchId.current;
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { users } = await server.queryMembersExperimental(q);
        if (id !== searchId.current) return;
        setResults(
          users
            .filter((u) => canTransferTo({ id: u.id, bot: u.bot }, ownerId))
            .slice(0, 8)
            .map((u) => ({ id: u.id, name: u.displayName ?? u.username, username: u.username, avatar: u.avatarURL })),
        );
      } catch (err) {
        if (id === searchId.current) setError(describeError(err));
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 250);
  };

  const close = () => {
    clearTimeout(timer.current);
    setDialog(null);
    setTyped("");
    setError(undefined);
    setQuery("");
    setResults([]);
    setPicked(null);
    setSearching(false);
  };

  /** One sheet at a time: step aside for the MFA dialog, then come back */
  const withTicket = async (which: "transfer" | "delete", run: (ticket: MFATicket) => Promise<void>) => {
    setError(undefined);
    setDialog(null);
    let ticket: MFATicket | undefined;
    try {
      ticket = await request({ afterSheet: true });
    } catch (err) {
      setDialog(which);
      setError(describeError(err));
      return;
    }
    setDialog(which);
    // cancelled: the dialog stays open, nothing else happens
    if (!ticket) return;
    setBusy(true);
    try {
      await run(ticket);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const transfer = () => {
    const to = picked;
    if (!to) return;
    void withTicket("transfer", async (ticket) => {
      await server.transferOwnership(to.id, ticket);
      close();
    });
  };

  /**
   * Delete, from the kit ConfirmDialog: it steps aside for the two-step code
   * (one sheet at a time) and comes back. A cancelled code keeps it open; a
   * failure shows inside it.
   */
  const remove = async () => {
    setDialog(null);
    let ticket: MFATicket | undefined;
    try {
      ticket = await request({ afterSheet: true });
    } finally {
      setDialog("delete");
    }
    if (!ticket) {
      keepOpen.current = true;
      return;
    }
    await server.delete(undefined, ticket);
    router.replace("/home");
  };

  const confirmed = confirmsName(typed, s.name);
  const nameField = (
    <TextField
      label={t`Server name`}
      placeholder={s.name}
      value={typed}
      onChangeText={(v) => {
        setTyped(v);
        setError(undefined);
      }}
      autoCapitalize="none"
      autoCorrect={false}
      error={error}
      testID="confirm-server-name"
    />
  );

  return (
    <SettingsSection title={t`Danger zone`} description={t`Give the server to someone else, or delete it.`}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Owner`}
          </AText>
          <RowGroup>
            <ControlRow
              first
              icon="crown"
              title={t`Transfer ownership`}
              description={t`Give the server to a member. You stay a member.`}
              control={
                <Button testID="transfer-server" label={t`Transfer`} variant="tonal" size="sm" onPress={() => setDialog("transfer")} />
              }
            />
          </RowGroup>
        </View>
        <View style={{ gap: 8 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Delete`}
          </AText>
          <RowGroup>
            <ControlRow
              first
              icon="trash"
              title={t`Delete server`}
              description={t`Removes every channel and message. It can't be undone.`}
              control={
                <Button testID="delete-server" label={t`Delete`} variant="danger" size="sm" onPress={() => setDialog("delete")} />
              }
            />
          </RowGroup>
        </View>
      </View>

      <DialogSheet
        visible={dialog === "transfer"}
        onClose={close}
        icon="crown"
        title={t`Transfer ownership`}
        testID="dialog-transfer"
        actions={[
          { label: t`Transfer`, kind: "danger", onPress: transfer, disabled: !picked || !confirmed, busy, testID: "transfer-confirm" },
          { label: t`Cancel`, onPress: close, testID: "transfer-cancel" },
        ]}
      >
        {picked ? (
          <>
            <AText size={15} line={22} color={palette.fg2}>
              {t`${picked.name} becomes the owner and can remove you. Type the server name to confirm.`}
            </AText>
            {nameField}
          </>
        ) : (
          <>
            <TextField
              label={t`Member`}
              placeholder={t`Type a name`}
              value={query}
              onChangeText={search}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              testID="transfer-member"
            />
            {searching ? (
              <AText size={13} line={18} color={palette.muted}>
                {t`Searching…`}
              </AText>
            ) : null}
            {results.length ? (
              <RowGroup>
                {results.map((u, i) => (
                  <Pressable
                    key={u.id}
                    testID={`transfer-pick-${u.id}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setPicked(u);
                      setError(undefined);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: palette.divider,
                      backgroundColor: pressed ? palette.navSelected : "transparent",
                    })}
                  >
                    <Avatar url={u.avatar} name={u.name} size={24} />
                    <View style={{ flex: 1 }}>
                      <AText autoDir size={15} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                        {u.name}
                      </AText>
                      <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1}>
                        {`@${u.username}`}
                      </AText>
                    </View>
                    <Icon name="caret-right" size={16} color={palette.muted} />
                  </Pressable>
                ))}
              </RowGroup>
            ) : null}
            {error ? (
              <AText size={13} line={18} color={palette.danger}>
                {error}
              </AText>
            ) : null}
          </>
        )}
      </DialogSheet>

      <ConfirmDialog
        visible={dialog === "delete"}
        title={t`Delete ${serverName}?`}
        text={t`Every channel and message is removed and it can't be undone. Type the server name to confirm. If you use two-step sign-in, you will be asked for your code next.`}
        confirm={t`Delete server`}
        disabled={!confirmed}
        onConfirm={remove}
        onClose={() => {
          // a cancelled two-step code: the dialog stays, with the name still typed
          if (keepOpen.current) {
            keepOpen.current = false;
            return;
          }
          close();
        }}
      >
        <TextField
          label={t`Server name`}
          placeholder={s.name}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          testID="confirm-server-name"
        />
      </ConfirmDialog>
      {mfaElement}
    </SettingsSection>
  );
}
