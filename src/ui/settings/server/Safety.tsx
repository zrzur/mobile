import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { clock } from "@/chat/time";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button, Chip } from "@/ui/kit";

import { DEFAULTS, MAX_RULES, newRule, parseList, PRESET_ID, PRESET_WORDS, problemOf, type Rule, type Trigger, TRIGGER_ICON, type TriggerType, upsertRule } from "../automod";

import { ConfirmDialog, ControlRow, InlineError, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { ChipChoice, LoadError, Loading, PickerSheet, SelectPill } from "./controls";

type Hours = 0 | 1 | 6 | 12 | 24;

/** Emergency (web: ServerEmergency): pauses, auto-saved */
function Emergency({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const s = useFields(server, (v) => ({ invites: v.invitesPausedUntil?.getTime() ?? 0, dms: v.dmsPausedUntil?.getTime() ?? 0, level: v.verificationLevel }));
  const [now, setNow] = useState(0);
  const [hours, setHours] = useState<{ invites: Hours; dms: Hours }>({ invites: 1, dms: 1 });
  const [picker, setPicker] = useState<"invites" | "dms" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  if (!s) return null;
  const manage = server.havePermission("ManageServer");
  const options: { value: Hours; label: string }[] = [
    { value: 1, label: t`1 hour` },
    { value: 6, label: t`6 hours` },
    { value: 12, label: t`12 hours` },
    { value: 24, label: t`1 day` },
  ];
  const pause = (kind: "invites" | "dms", h: Hours) => {
    setPending(true);
    setError(undefined);
    server
      .pauseSafety(kind === "invites" ? { invitesHours: h } : { dmsHours: h })
      .catch((err) => setError(describeError(err)))
      .finally(() => {
        setPending(false);
        setNow(Date.now());
      });
  };
  const rows = [
    { kind: "invites" as const, icon: "link" as IconName, title: t`Pause invites`, text: t`Nobody can join with an invite, the custom link or Discover.`, until: s.invites },
    { kind: "dms" as const, icon: "chat-circle" as IconName, title: t`Pause direct messages`, text: t`Members who aren't friends can't message each other.`, until: s.dms },
  ];
  const levelName = { None: t`None`, Low: t`Low`, Medium: t`Medium`, High: t`High` }[s.level as "None"] ?? s.level;
  return (
    <>
      <SettingsSection title={t`Emergency`} description={t`Pause invites or messages during a raid.`}>
        <View style={{ gap: 8 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2}>
            {t`Pauses`}
          </AText>
          <RowGroup>
            {rows.map((r, i) => {
              // an ended pause is stored as the server's "now": a few seconds of clock skew count as over
              const active = now > 0 && r.until - now > 5000;
              const time = clock(new Date(r.until), i18n.locale);
              const label = r.title;
              const duration = options.find((o) => o.value === hours[r.kind])?.label ?? "";
              return (
                <ControlRow
                  key={r.kind}
                  first={i === 0}
                  icon={r.icon}
                  title={r.title}
                  description={active ? t`Paused until ${time}.` : r.text}
                  control={
                    active ? (
                      <SmallButton label={t`End now`} accessibilityLabel={t`End now: ${label}`} disabled={!manage || pending} onPress={() => pause(r.kind, 0)} />
                    ) : (
                      <View style={{ alignItems: "flex-end" }}>
                        <SelectPill label={t`Duration: ${label}`} value={duration} disabled={!manage || pending} onPress={() => setPicker(r.kind)} testID={`pause-${r.kind}-duration`} />
                        <SmallButton label={t`Pause`} accessibilityLabel={label} testID={`pause-${r.kind}`} disabled={!manage || pending} onPress={() => pause(r.kind, hours[r.kind])} />
                      </View>
                    )
                  }
                />
              );
            })}
          </RowGroup>
          <InlineError message={error} />
          <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ marginTop: 8 }}>
            {t`Lasting protection`}
          </AText>
          <RowGroup>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/server-section/[id]/[section]", params: { id: server.id, section: "joining" } })}>
              <ControlRow first icon="seal-check" title={t({ message: "Verification", context: "server-settings" })} description={t`Now: ${levelName}. Raise it during a raid.`} control={<Icon name="caret-right" size={16} color={palette.iconMuted} />} />
            </Pressable>
          </RowGroup>
        </View>
      </SettingsSection>
      {picker ? (
        <PickerSheet
          visible
          title={rows.find((r) => r.kind === picker)?.title ?? ""}
          value={hours[picker]}
          options={options}
          onPick={(v) => setHours({ ...hours, [picker]: v })}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}

/** The rule editor (web: rule dialog) as a bottom sheet */
function RuleSheet({
  server,
  rule,
  isNew,
  saving,
  saveError,
  onSave,
  onDelete,
  onClose,
}: {
  server: Server;
  rule: Rule;
  isNew: boolean;
  saving: boolean;
  saveError?: string;
  onSave: (r: Rule) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [d, setD] = useState(rule);
  const [words, setWords] = useState(rule.trigger.type === "Keywords" ? rule.trigger.words.join("\n") : "");
  const [allow, setAllow] = useState(rule.trigger.type === "Keywords" ? (rule.trigger.allow ?? []).join("\n") : "");
  const [domains, setDomains] = useState(rule.trigger.type === "LinkSpam" ? (rule.trigger.allowed_domains ?? []).join("\n") : "");
  const json = useSolid(
    useCallback(
      () =>
        JSON.stringify({
          roles: server.orderedRoles.map((r) => ({ id: r.id, name: r.name })),
          channels: server.channels.filter((c) => c.type === "TextChannel").map((c) => ({ id: c.id, name: c.name })),
        }),
      [server],
    ),
  );
  const lists = useMemo(() => JSON.parse(json) as { roles: { id: string; name: string }[]; channels: { id: string; name: string }[] }, [json]);
  const problem = problemOf(d);
  const types: { value: TriggerType; label: string }[] = [
    { value: "Keywords", label: t`Blocked words` },
    { value: "MentionSpam", label: t`Mention spam` },
    { value: "LinkSpam", label: t`Link spam` },
    { value: "RepeatedMessages", label: t`Repeated messages` },
  ];
  const linkOptions = [
    { value: 0, label: t`Off` },
    { value: 10, label: t`10 minutes` },
    { value: 60, label: t`1 hour` },
    { value: 1440, label: t`1 day` },
    { value: 10080, label: t`7 days` },
  ];
  const timeoutOptions = [
    { value: 0, label: t`Off` },
    { value: 1, label: t`1 minute` },
    { value: 10, label: t`10 minutes` },
    { value: 60, label: t`1 hour` },
    { value: 1440, label: t`1 day` },
    { value: 10080, label: t`7 days` },
  ];
  const alertOptions = [{ value: "", label: t`Off` }, ...lists.channels.map((c) => ({ value: c.id, label: `#${c.name}` }))];
  const tr = d.trigger;
  const setTrigger = (patch: Partial<Trigger>) => setD({ ...d, trigger: { ...tr, ...patch } as Trigger });
  const toggleIn = (key: "exempt_roles" | "exempt_channels", id: string) => {
    const list = d[key] ?? [];
    setD({ ...d, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };
  const hint =
    problem === "name"
      ? t`Give the rule a name.`
      : problem === "words"
        ? t`Add at least one word or phrase.`
        : problem === "numbers"
          ? t`Check the numbers.`
          : problem === "link"
            ? t`Choose new members, allowed domains, or both.`
            : problem === "action"
              ? t`Choose at least one action.`
              : saveError;
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

  return (
    <Sheet visible onClose={onClose} testID="rule-sheet">
      <AText size={18} line={26} weight="bold" color={palette.header}>
        {isNew ? t`New rule` : t`Edit rule`}
      </AText>
      <TextField label={t`Name`} value={d.name} onChangeText={(v) => setD({ ...d, name: v })} maxLength={64} testID="rule-name" />
      <ChipChoice
        label={t`Looks for`}
        value={tr.type}
        options={types}
        onChange={(v) => {
          if (v === tr.type) return;
          setD({ ...d, trigger: DEFAULTS[v] });
          setWords("");
          setAllow("");
          setDomains("");
        }}
      />
      {tr.type === "Keywords" ? (
        <>
          <TextField
            label={t`Words and phrases`}
            placeholder={t`One per line. Put * at the start or end to match part of a word.`}
            value={words}
            onChangeText={(v) => {
              setWords(v);
              setTrigger({ words: parseList(v) });
            }}
            multiline
            style={{ minHeight: 88, textAlignVertical: "top" }}
            testID="rule-words"
          />
          <TextField
            label={t`Always allowed`}
            placeholder={t`Words that are fine, one per line`}
            value={allow}
            onChangeText={(v) => {
              setAllow(v);
              setTrigger({ allow: parseList(v) });
            }}
            multiline
            style={{ minHeight: 56, textAlignVertical: "top" }}
          />
          <AText size={13} line={18} color={palette.muted}>
            {t`Arabic matches with or without hamza, tashkeel and tatweel, and ة / ه, ى / ي alike.`}
          </AText>
        </>
      ) : null}
      {tr.type === "MentionSpam" ? (
        <TextField label={t`Most mentions in one message`} keyboardType="number-pad" value={Number.isNaN(tr.max) ? "" : String(tr.max)} onChangeText={(v) => setTrigger({ max: num(v) })} />
      ) : null}
      {tr.type === "LinkSpam" ? (
        <>
          <ChipChoice label={t`Links from members who joined less than`} value={tr.new_member_minutes ?? 0} options={linkOptions} onChange={(v) => setTrigger({ new_member_minutes: v || null })} />
          <TextField
            label={t`Allowed domains (optional)`}
            latin
            placeholder={t`One per line, for example zrzur.com`}
            value={domains}
            onChangeText={(v) => {
              setDomains(v);
              setTrigger({ allowed_domains: parseList(v) });
            }}
            multiline
            autoCapitalize="none"
            style={{ minHeight: 56, textAlignVertical: "top" }}
          />
        </>
      ) : null}
      {tr.type === "RepeatedMessages" ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label={t`Same text in channels`} keyboardType="number-pad" value={Number.isNaN(tr.channels) ? "" : String(tr.channels)} onChangeText={(v) => setTrigger({ channels: num(v) })} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t`Within seconds`} keyboardType="number-pad" value={Number.isNaN(tr.seconds) ? "" : String(tr.seconds)} onChangeText={(v) => setTrigger({ seconds: num(v) })} />
          </View>
        </View>
      ) : null}

      <AText size={15} line={22} weight="semibold" color={palette.header}>
        {t`When it matches`}
      </AText>
      <RowGroup>
        <ControlRow
          first
          title={t`Block the message`}
          description={t`The member sees the rule's name as the reason.`}
          control={<Toggle label={t`Block the message`} value={!!d.actions.block} onChange={(on) => setD({ ...d, actions: { ...d.actions, block: on } })} />}
        />
      </RowGroup>
      <ChipChoice label={t`Send an alert to`} value={d.actions.alert_channel ?? ""} options={alertOptions} onChange={(v) => setD({ ...d, actions: { ...d.actions, alert_channel: v || null } })} />
      <ChipChoice label={t`Time out for`} value={d.actions.timeout_minutes ?? 0} options={timeoutOptions} onChange={(v) => setD({ ...d, actions: { ...d.actions, timeout_minutes: v || null } })} />

      <AText size={15} line={22} weight="semibold" color={palette.header}>
        {t`Not checked`}
      </AText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {lists.roles.map((r) => (
          <Chip key={r.id} label={r.name} selected={(d.exempt_roles ?? []).includes(r.id)} icon={(d.exempt_roles ?? []).includes(r.id) ? "check" : undefined} onPress={() => toggleIn("exempt_roles", r.id)} />
        ))}
        {lists.channels.map((c) => (
          <Chip key={c.id} label={`#${c.name}`} selected={(d.exempt_channels ?? []).includes(c.id)} icon={(d.exempt_channels ?? []).includes(c.id) ? "check" : undefined} onPress={() => toggleIn("exempt_channels", c.id)} />
        ))}
      </View>

      <InlineError message={hint} />
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {!isNew ? (
          <Pressable testID="rule-delete" accessibilityRole="button" onPress={onDelete} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center", marginEnd: "auto", backgroundColor: pressed ? palette.navHover : "transparent" })}>
            <AText size={14} line={20} weight="semibold" color={palette.danger}>
              {t`Delete`}
            </AText>
          </Pressable>
        ) : null}
        <SmallButton label={t`Cancel`} onPress={onClose} />
        <SmallButton label={saving ? t`Saving…` : t`Save`} primary testID="rule-save" disabled={!!problem || saving} onPress={() => onSave(d)} />
      </View>

    </Sheet>
  );
}

/** Filters (web: AutoModSettings) */
function Filters({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ rule: Rule; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  useEffect(() => {
    let live = true;
    server
      .fetchAutoMod()
      .then((r) => live && setRules(r as unknown as Rule[]))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [server, reload]);

  const save = async (next: Rule[]) => {
    setSaving(true);
    setError(undefined);
    try {
      setRules((await server.setAutoMod(next as never)) as unknown as Rule[]);
      return true;
    } catch (err) {
      setError(describeError(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const summary = (r: Rule) => {
    const type = { Keywords: t`Blocked words`, MentionSpam: t`Mention spam`, LinkSpam: t`Link spam`, RepeatedMessages: t`Repeated messages` }[r.trigger.type];
    const parts = [r.actions.block ? t`blocks` : null, r.actions.alert_channel ? t`alerts` : null, r.actions.timeout_minutes ? t`times out` : null].filter(Boolean);
    return [type, ...parts].join(" · ");
  };
  const full = (rules?.length ?? 0) >= MAX_RULES;
  const presetName = t`Arabic insults`;
  const deletingName = deleting?.name ?? "";

  return (
    <SettingsSection title={t`Filters`} description={t`Rules that stop spam, bad words and unwanted links.`}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`Rules`}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {t`Bots and the owner are not checked.`}
            </AText>
          </View>
          <Button testID="add-rule" label={t`Add rule`} icon="plus" variant="tonal" size="sm" disabled={!rules || full} onPress={() => rules && setEditing({ rule: newRule(rules), isNew: true })} />
        </View>
        {loadError ? (
          <LoadError
            text={t`Rules couldn't be loaded`}
            onRetry={() => {
              setLoadError(false);
              setReload((n) => n + 1);
            }}
          />
        ) : !rules ? (
          <Loading text={t`Loading rules…`} />
        ) : (
        <RowGroup>
          {(
            <>
              {rules.length === 0 ? (
                <ControlRow first icon="shield-check" title={t`No rules yet`} description={t`Block words, mention spam, links from new members or the same message in many channels.`} control={null} />
              ) : (
                rules.map((r, i) => (
                  <Pressable key={r.id} testID={`rule-${r.id}`} accessibilityRole="button" onPress={() => setEditing({ rule: r, isNew: false })}>
                    <ControlRow
                      first={i === 0}
                      icon={TRIGGER_ICON[r.trigger.type]}
                      title={r.name}
                      description={summary(r)}
                      control={<Toggle label={r.name} value={r.enabled !== false} disabled={saving} onChange={() => void save(rules.map((x) => (x.id === r.id ? { ...x, enabled: x.enabled === false } : x)))} />}
                    />
                  </Pressable>
                ))
              )}
              {!rules.some((r) => r.id === PRESET_ID) ? (
                <ControlRow
                  icon="shield-check"
                  title={presetName}
                  description={t`An optional list that blocks common Arabic insults. Switch it on and it becomes a rule you can edit.`}
                  control={
                    <Toggle
                      label={presetName}
                      value={false}
                      disabled={saving || full}
                      onChange={() => void save([...rules, { id: PRESET_ID, name: presetName, enabled: true, trigger: { type: "Keywords", words: PRESET_WORDS, allow: [] }, actions: { block: true } }])}
                    />
                  }
                />
              ) : null}
            </>
          )}
        </RowGroup>
        )}
        {!editing && !deleting ? <InlineError message={error} /> : null}
      </View>
      {editing && rules ? (
        <RuleSheet
          server={server}
          rule={editing.rule}
          isNew={editing.isNew}
          saving={saving}
          saveError={error}
          onClose={() => {
            setEditing(null);
            setError(undefined);
          }}
          onDelete={() => {
            // one window at a time (iOS can't stack two sheets side by side)
            setDeleting(editing.rule);
            setEditing(null);
          }}
          onSave={async (r) => {
            if (await save(upsertRule(rules, r))) setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={!!deleting}
        title={t`Delete this rule?`}
        text={t`"${deletingName}" stops filtering messages right away.`}
        confirm={t`Delete rule`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!rules || !deleting) return;
          const next = rules.filter((r) => r.id !== deleting.id);
          setRules((await server.setAutoMod(next as never)) as unknown as Rule[]);
          setEditing(null);
        }}
      />
    </SettingsSection>
  );
}

/** Safety (web: SafetyPage) */
export function SafetyPage({ server }: { server: Server }) {
  const { t } = useLingui();
  return (
    <SettingsPage title={t({ message: "Safety", context: "server-settings" })} description={t`Emergency tools, and filters against spam and unwanted links.`} testID="server-safety">
      <Emergency server={server} />
      <Filters server={server} />
    </SettingsPage>
  );
}
