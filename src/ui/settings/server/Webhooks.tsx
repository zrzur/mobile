import { useLingui } from "@lingui/react/macro";
import type { Channel, ChannelWebhook, Server } from "@zrzur/sdk/solid";
import * as ImagePicker from "expo-image-picker";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Button } from "@/ui/kit";
import { Avatar } from "@/ui/Avatar";
import { describeError } from "@/auth/errorText";
import { Icon, type IconName } from "@/ui/Icon";

import { ConfirmDialog } from "../parts";
import {
  channelLabel,
  codePoints,
  filterWebhooks,
  groupByChannel,
  newestFirst,
  WEBHOOK_NAME_MAX,
  type WebhookMaker,
  webhookChanges,
  webhookFacts,
  webhookNameProblem,
} from "../webhooks";
import { PickerSheet, SelectField as SelectBox } from "./controls";
import { copyToClipboard } from "@/ui/kit/share";

/* ------------------------------------------------------------------ */
/* Shared pieces (also used by Apps)                                    */
/* ------------------------------------------------------------------ */

/** The web Segmented: options in one pill row, the chosen one raised */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  testID,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignSelf: "flex-start", padding: 2, gap: 2, borderRadius: 12, backgroundColor: palette.field, opacity: disabled ? 0.5 : 1 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            aria-checked={on}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 16,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? palette.tonal : pressed ? palette.navSelected : "transparent",
            })}
          >
            <AText size={14} line={20} weight={on ? "semibold" : "medium"} color={on ? palette.fg : palette.fg2}>
              {o.label}
            </AText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The web BotLabel: "Bot", "Bot" with a check (verified) or "Official bot" */
export function BotTag({ official, verified }: { official?: boolean; verified?: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const spoken = verified && !official ? `${t`Verified bot`}: ${t`The Zrzur team reviewed this bot.`}` : undefined;
  return (
    <View
      accessible
      accessibilityLabel={spoken ?? (official ? t`Official bot` : t`Bot`)}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, minHeight: 18, borderRadius: 6, backgroundColor: palette.accent, alignSelf: "center" }}
    >
      {official ? <Icon name="shield-check" size={12} color={palette.onAccent} /> : verified ? <Icon name="check" size={12} color={palette.onAccent} /> : null}
      <AText size={11} line={16} weight="semibold" color={palette.onAccent}>
        {official ? t`Official bot` : t`Bot`}
      </AText>
    </View>
  );
}

/** A select as a field: label, a 44 px box with the value and a caret (opens a PickerSheet) */
export function SelectField({ label, hideLabel, value, onPress, disabled, testID }: { label: string; hideLabel?: boolean; value: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {hideLabel ? null : (
        <AText size={13} line={20} weight="semibold" color={palette.fg2}>
          {label}
        </AText>
      )}
      <SelectBox label={label} value={value || "—"} onPress={onPress} disabled={disabled} testID={testID} />
    </View>
  );
}

/** A row in a group that only says something (loading, empty, error), with an optional button */
export function NoteRow({ icon, title, description, danger, action }: { icon?: IconName; title: string; description?: string; danger?: boolean; action?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <RowGroup>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16 }}>
        {icon ? <Icon name={icon} size={20} color={danger ? palette.danger : palette.iconNeutral} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={16} line={22} weight="medium" color={danger ? palette.danger : palette.fg}>
            {title}
          </AText>
          {description ? (
            <AText size={13} line={18} color={palette.muted}>
              {description}
            </AText>
          ) : null}
        </View>
        {action}
      </View>
    </RowGroup>
  );
}

/** A row button: the kit's small tonal button, or a text-only danger one (Delete) in the same 44 px box */
export function RowButton({ label, onPress, disabled, danger, testID }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; testID?: string }) {
  const { palette } = useTheme();
  if (!danger) return <Button label={label} onPress={onPress} disabled={disabled} testID={testID} variant="tonal" size="sm" />;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 10,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      <AText size={14} line={20} weight="semibold" color={palette.danger}>
        {label}
      </AText>
    </Pressable>
  );
}

/** A sub-heading inside a section (web: SettingsSection title) */
function GroupTitle({ title, description }: { title: string; description?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <AText size={15} line={20} weight="semibold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      {description ? (
        <AText size={13} line={18} color={palette.muted}>
          {description}
        </AText>
      ) : null}
    </View>
  );
}

/**
 * A dialog with its own buttons (web Dialog): the same bottom card as
 * ConfirmDialog, the primary action first.
 */
function Dialog({
  visible,
  title,
  onClose,
  children,
  actions,
  testID,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  actions: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; busy?: boolean; testID?: string }[];
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <SheetModal visible={visible} onClose={onClose} testID={testID} panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {title}
          </AText>
          {children}
          <View style={{ gap: 8 }}>
            {actions.map((a) => (
              <Button key={a.label} testID={a.testID} label={a.label} onPress={a.onPress} disabled={a.disabled} status={a.busy ? "submitting" : "ready"} variant={a.primary ? "primary" : "tonal"} fill />
            ))}
          </View>
    </SheetModal>
  );
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                             */
/* ------------------------------------------------------------------ */

type Fresh = { name: string; url: string };
type ChannelOption = { id: string; name: string };
type Picked = { uri: string; name: string; type: string; size?: number };

function WebhookRow({
  hook,
  first,
  testing,
  onEdit,
  onTest,
  onRenew,
  onDelete,
  onCopy,
}: {
  hook: ChannelWebhook;
  first: boolean;
  testing: boolean;
  onEdit: () => void;
  onTest: () => void;
  onRenew: () => void;
  onDelete: () => void;
  onCopy: (url: string) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const f = useFields(hook, (w) => {
    const creator = client.users.get(w.creatorId);
    return {
      name: w.name,
      avatar: w.avatarURL,
      url: w.url,
      creator: creator?.displayName ?? creator?.username ?? w.creatorId,
      bot: !!creator?.bot,
      official: !!creator?.officialBot,
      verified: !!creator?.verifiedBot,
      createdAt: w.createdAt.getTime(),
      lastUsed: w.lastUsed?.getTime(),
    };
  });
  if (!f) return null;
  return (
    <View testID={`webhook-row-${hook.id}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ paddingTop: 2 }}>
          <Avatar url={f.avatar} name={f.name} size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={16} line={22} weight="medium" color={palette.fg}>
            {f.name}
          </AText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <AText size={13} line={18} color={palette.muted} style={{ flexShrink: 1 }}>
              {webhookFacts(i18n, { creator: f.creator, createdAt: f.createdAt, lastUsed: f.lastUsed })}
            </AText>
            {f.bot ? <BotTag official={f.official} verified={f.verified} /> : null}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, justifyContent: "flex-end", marginVertical: -4 }}>
        {f.url ? <RowButton label={t`Copy address`} onPress={() => onCopy(f.url!)} testID="webhook-copy" /> : null}
        <RowButton label={t`Edit`} onPress={onEdit} testID="webhook-edit" />
        <RowButton label={t`Send test`} onPress={onTest} disabled={testing} testID="webhook-test" />
        <RowButton label={t`New address`} onPress={onRenew} testID="webhook-renew" />
        <RowButton label={t`Delete`} onPress={onDelete} danger testID="webhook-delete" />
      </View>
    </View>
  );
}

/**
 * Webhooks in one place: all of a server, or one channel's (`channel`: no
 * channel select, no group titles). A token is shown once, when it is
 * made: the server stores a hash, so a lost address can only be replaced.
 */
export function WebhooksPanel({ server, channel }: { server: Server; channel?: Channel }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();

  // without features.webhooks in the root response the routes are not there
  const available = (client.configuration?.features as { webhooks?: boolean } | undefined)?.webhooks === true;

  const channelsJson = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          (channel ? [channel] : server.channels.filter((c) => c.type === "TextChannel" && !c.isVoiceRoom && c.havePermission("ManageWebhooks"))).map((c) => ({
            id: c.id,
            name: c.name,
          })),
        ),
      [server, channel],
    ),
  );
  const channels = useMemo(() => JSON.parse(channelsJson) as ChannelOption[], [channelsJson]);
  const nameOf = (id: string) => channels.find((c) => c.id === id)?.name ?? client.channels.get(id)?.name ?? id;

  // ----- the list -----
  const [version, setVersion] = useState(0);
  const [list, setList] = useState<{ state: "loading" | "error" | "ready"; hooks: ChannelWebhook[]; error?: string }>({ state: "loading", hooks: [] });
  useEffect(() => {
    if (!available) return;
    let live = true;
    (channel ? channel.fetchWebhooks() : client.channelWebhooks.fetchForServer(server.id))
      .then(async (hooks) => {
        // names for "Created by"
        const creators = [...new Set(hooks.map((h) => h.creatorId))].filter((id) => !client.users.get(id));
        await Promise.all(creators.map((id) => client.users.fetch(id).catch(() => undefined)));
        if (live) setList({ state: "ready", hooks });
      })
      .catch((err) => {
        if (live) setList((prev) => ({ state: "error", hooks: prev.hooks, error: describeError(err) }));
      });
    return () => {
      live = false;
    };
  }, [available, channel, client, server, version]);
  const refresh = () => setVersion((n) => n + 1);

  const [maker, setMaker] = useState<WebhookMaker>("all");
  const madeByBot = (id: string) => !!client.users.get(id)?.bot;
  const anyByBot = list.hooks.some((h) => madeByBot(h.creatorId));
  const shown = filterWebhooks(newestFirst(list.hooks.map((hook) => ({ hook, creatorId: hook.creatorId, channelId: hook.channelId, createdAt: hook.createdAt.getTime() }))), anyByBot ? maker : "all", madeByBot);
  const groups = groupByChannel(shown);

  // ----- lines under the create form -----
  const [status, setStatus] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const report = (message?: string, err?: unknown) => {
    setStatus(message);
    setActionError(err === undefined ? undefined : describeError(err));
  };

  // ----- the address, shown once -----
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [copied, setCopied] = useState(false);
  const copyAddress = async (url: string) => {
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ----- create -----
  const [channelId, setChannelId] = useState("");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [picker, setPicker] = useState<"create" | "edit" | null>(null);
  const target = channels.find((c) => c.id === channelId) ?? channels[0];
  const problem = webhookNameProblem(name);
  const max = WEBHOOK_NAME_MAX;
  const longName = t`Use at most ${max} characters.`;
  const nameError = createError ?? (name.trim() && problem === "long" ? longName : undefined);

  const create = async () => {
    const into = target ? (channel ?? client.channels.get(target.id)) : undefined;
    if (!into || creating || problem) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      const hook = await into.createWebhook(name.trim());
      setName("");
      if (hook.url) setFresh({ name: hook.name, url: hook.url });
      refresh();
    } catch (err) {
      setCreateError(describeError(err));
    } finally {
      setCreating(false);
    }
  };

  // ----- edit -----
  const [editing, setEditing] = useState<ChannelWebhook | null>(null);
  const [editName, setEditName] = useState("");
  const [editChannel, setEditChannel] = useState("");
  // undefined = unchanged, null = removed
  const [editIcon, setEditIcon] = useState<Picked | null | undefined>(undefined);
  const [editError, setEditError] = useState<string>();
  const [iconError, setIconError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const iconLimit = (client as unknown as { limits?: { file_upload_size_limits?: Record<string, number> } }).limits?.file_upload_size_limits?.icons;

  const startEdit = (hook: ChannelWebhook) => {
    setEditName(hook.name);
    setEditChannel(hook.channelId);
    setEditIcon(undefined);
    setEditError(undefined);
    setIconError(undefined);
    setEditing(hook);
  };

  const pickIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
    if (result.canceled) return;
    const a = result.assets[0];
    if (iconLimit && a.fileSize && a.fileSize > iconLimit) {
      const size = `${Math.round((iconLimit / 1_000_000) * 10) / 10} MB`;
      setIconError(t`File must be smaller than ${size}`);
      return;
    }
    setIconError(undefined);
    setEditIcon({ uri: a.uri, name: a.fileName ?? "icon.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize });
  };

  const saveEdit = async () => {
    const hook = editing;
    if (!hook || webhookNameProblem(editName)) return;
    setSaving(true);
    setEditError(undefined);
    try {
      let avatar: string | null | undefined;
      if (editIcon === null) avatar = null;
      else if (editIcon) avatar = await client.uploadFile("avatars", { uri: editIcon.uri, name: editIcon.name, type: editIcon.type } as unknown as File);
      const changes = webhookChanges({ name: hook.name, channelId: hook.channelId }, { name: editName, channelId: editChannel, avatar });
      await hook.edit(changes as never);
      setEditing(null);
      report(t`Saved`);
      refresh();
    } catch (err) {
      // the reason shows on the name field and the dialog stays open
      setEditError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  // ----- new address -----
  const [renewing, setRenewing] = useState<ChannelWebhook | null>(null);
  const renewed = useRef<Fresh | null>(null);

  // ----- test message -----
  const [testing, setTesting] = useState<string>();
  const sendTest = async (hook: ChannelWebhook) => {
    setTesting(hook.id);
    try {
      await hook.sendTest(t`This is a test message.`);
      const channelName = nameOf(hook.channelId);
      report(t`Test message sent to #${channelName}.`);
      refresh();
    } catch (err) {
      report(undefined, err);
    } finally {
      setTesting(undefined);
    }
  };

  // ----- delete -----
  const [removing, setRemoving] = useState<ChannelWebhook | null>(null);

  if (!available) {
    return <NoteRow icon="webhooks-logo" title={t`Webhooks are switched off here.`} description={t`Whoever runs this Zrzur server can turn them on in its configuration.`} />;
  }

  const editShownIcon = editIcon === null ? undefined : editIcon ? editIcon.uri : editing?.avatarURL;
  const editProblem = webhookNameProblem(editName);
  const editNameError = editError ?? (editName.trim() && editProblem === "long" ? longName : undefined);
  const canMove = !channel && channels.length > 1;
  const freshName = fresh?.name ?? "";

  return (
    <View testID="webhooks-panel" style={{ gap: 24 }}>
      {/* New webhook */}
      <View style={{ gap: 12 }}>
        <GroupTitle title={t`New webhook`} description={t`A webhook posts into one channel through its address. The address is shown once, so keep it safe.`} />
        <RowGroup>
          <View style={{ padding: 16, gap: 16 }}>
            {channels.length === 0 ? (
              <AText size={14} line={20} color={palette.fg2}>
                {t`There is no channel where you can manage webhooks.`}
              </AText>
            ) : (
              <>
                {channel ? null : <SelectField label={t`Channel`} hideLabel value={target ? channelLabel(target.name) : ""} onPress={() => setPicker("create")} testID="webhook-channel" />}
                <TextField
                  label={t`Webhook name`}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setCreateError(undefined);
                  }}
                  error={nameError}
                  helper={`${codePoints(name)}/${WEBHOOK_NAME_MAX}`}
                  returnKeyType="done"
                  onSubmitEditing={() => void create()}
                  testID="webhook-name"
                />
                <Button testID="webhook-create" label={t`Create webhook`} status={creating ? "submitting" : "ready"} disabled={creating || !!problem} onPress={() => void create()} fill />
              </>
            )}
          </View>
        </RowGroup>
      </View>

      {status ? (
        <AText size={14} line={20} color={palette.fg2} accessibilityLiveRegion="polite" testID="webhook-status">
          {status}
        </AText>
      ) : null}
      {actionError ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Icon name="warning-circle" size={16} color={palette.danger} />
          <AText size={14} line={20} color={palette.danger} style={{ flex: 1 }}>
            {actionError}
          </AText>
        </View>
      ) : null}

      {/* The list */}
      {list.state === "error" ? (
        <NoteRow
          icon="webhooks-logo"
          title={t`The webhooks could not be loaded.`}
          description={list.error}
          action={
            <RowButton
              label={t`Try again`}
              onPress={() => {
                setList((prev) => ({ ...prev, state: "loading" }));
                refresh();
              }}
              testID="webhooks-retry"
            />
          }
        />
      ) : list.state === "loading" && list.hooks.length === 0 ? (
        <NoteRow title={t`Loading…`} />
      ) : list.hooks.length === 0 ? (
        <NoteRow icon="webhooks-logo" title={t`No webhooks yet.`} description={t`Create one above.`} />
      ) : (
        <View style={{ gap: 16 }}>
          {anyByBot ? (
            <Segmented
              label={t`Show webhooks made by`}
              value={maker}
              onChange={setMaker}
              options={[
                { value: "all", label: t`All` },
                { value: "bots", label: t`Made by bots` },
                { value: "people", label: t`Made by people` },
              ]}
              testID="webhook-maker"
            />
          ) : null}
          {groups.length === 0 ? <NoteRow icon="webhooks-logo" title={t`No webhooks match this filter.`} /> : null}
          {groups.map((group) => (
            <View key={group.channelId} style={{ gap: 8 }}>
              {channel ? null : <GroupTitle title={channelLabel(nameOf(group.channelId))} />}
              <RowGroup>
                {group.hooks.map(({ hook }, i) => (
                  <WebhookRow
                    key={hook.id}
                    hook={hook}
                    first={i === 0}
                    testing={testing === hook.id}
                    onCopy={(url) => void copyAddress(url)}
                    onEdit={() => startEdit(hook)}
                    onTest={() => void sendTest(hook)}
                    onRenew={() => setRenewing(hook)}
                    onDelete={() => setRemoving(hook)}
                  />
                ))}
              </RowGroup>
            </View>
          ))}
        </View>
      )}

      <PickerSheet
        visible={picker === "create"}
        title={t`Channel`}
        value={target?.id ?? ""}
        options={channels.map((c) => ({ value: c.id, label: channelLabel(c.name) }))}
        onPick={setChannelId}
        onClose={() => setPicker(null)}
      />

      {/* Address of …, shown once */}
      <Dialog
        visible={!!fresh}
        testID="webhook-address"
        title={t`Address of ${freshName}`}
        onClose={() => setFresh(null)}
        actions={[
          { label: copied ? t`Copied` : t`Copy`, primary: true, onPress: () => fresh && void copyAddress(fresh.url), testID: "webhook-address-copy" },
          { label: t`Done`, onPress: () => setFresh(null), testID: "webhook-address-done" },
        ]}
      >
        <AText size={15} line={22} color={palette.fg2}>
          {t`Copy it now: it is not shown again. Anyone who has it can post here, so keep it private.`}
        </AText>
        <TextField label={t`Webhook address`} value={fresh?.url ?? ""} editable={false} selectTextOnFocus multiline style={{ writingDirection: "ltr" }} testID="webhook-address-field" />
      </Dialog>

      {/* Edit webhook */}
      <Dialog
        visible={!!editing && picker !== "edit"}
        testID="webhook-edit-dialog"
        title={t`Edit webhook`}
        onClose={() => setEditing(null)}
        actions={[
          { label: t`Save`, primary: true, busy: saving, disabled: !!editProblem, onPress: () => void saveEdit(), testID: "webhook-edit-save" },
          { label: t`Cancel`, onPress: () => setEditing(null) },
        ]}
      >
        <View style={{ gap: 8 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Webhook icon`}
          </AText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t`Webhook icon`} onPress={() => void pickIcon()} testID="webhook-icon" style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center" }}>
              {editShownIcon ? <Avatar url={editShownIcon} name={editName} size={64} /> : (
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="image" size={24} color={palette.iconMuted} />
                </View>
              )}
            </Pressable>
            {editShownIcon ? <RowButton label={t`Remove`} danger onPress={() => setEditIcon(null)} testID="webhook-icon-remove" /> : null}
          </View>
          {iconError ? (
            <AText size={12} line={16} weight="medium" color={palette.danger} accessibilityRole="alert">
              {iconError}
            </AText>
          ) : null}
        </View>
        <TextField
          label={t`Webhook name`}
          value={editName}
          onChangeText={(v) => {
            setEditName(v);
            setEditError(undefined);
          }}
          error={editNameError}
          helper={`${codePoints(editName)}/${WEBHOOK_NAME_MAX}`}
          testID="webhook-edit-name"
        />
        {canMove ? (
          <SelectField label={t`Channel`} hideLabel value={channelLabel(nameOf(editChannel))} onPress={() => setPicker("edit")} testID="webhook-edit-channel" />
        ) : null}
      </Dialog>
      {/* one modal at a time: the edit dialog hides while its channel list is open */}
      <PickerSheet
        visible={picker === "edit"}
        title={t`Channel`}
        value={editChannel}
        options={channels.map((c) => ({ value: c.id, label: channelLabel(c.name) }))}
        onPick={setEditChannel}
        onClose={() => setPicker(null)}
      />

      <ConfirmDialog
        visible={!!renewing}
        title={t`Make a new address?`}
        text={t`The current address stops working at once. Anything that posts with it needs the new one.`}
        confirm={t`Make new address`}
        onClose={() => {
          setRenewing(null);
          const next = renewed.current;
          renewed.current = null;
          // the address dialog opens once this one has gone
          if (next) setTimeout(() => setFresh(next), 350);
        }}
        onConfirm={async () => {
          if (!renewing) return;
          const url = await renewing.regenerateToken();
          renewed.current = { name: renewing.name, url };
          report();
        }}
      />

      <ConfirmDialog
        visible={!!removing}
        title={t`Delete this webhook?`}
        text={t`Anything that still posts with its address will stop working.`}
        confirm={t`Delete`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await removing.delete();
          report(t`Saved`);
          refresh();
        }}
      />
    </View>
  );
}
