import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { inputSideStyle } from "@/ui/kit/bidi";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { TextField } from "@/ui/auth/parts";
import { Button } from "@/ui/kit";
import { AText } from "@/ui/kit/Text";

import { ConfirmDialog, ControlRow, InlineError, SettingsPage, SettingsSection, Toggle } from "../parts";
import {
  alreadyAuthorized,
  ASSISTANT,
  type AssistantConfig,
  AssistantError,
  assistantApi,
  type AssistantServer,
  connect,
  type Field,
  isConnected,
  type ModuleMeta,
  type ModuleState,
  type Staff,
} from "./assistantApi";
import { linesOf, type ModuleTab, purgeDate, tabsOf } from "./assistantLogic";
import { useAssistantWords } from "./assistantWords";
import { FieldLabel, Loading, PickerSheet, SelectField } from "./controls";
import { Segmented } from "./Webhooks";

const LANGUAGES = [
  ["ar", "العربية"],
  ["en", "English"],
  ["de", "Deutsch"],
] as const;

const GROUPS = ["safety", "community", "support", "utilities"];

type Choice = { id: string; name: string };

/** Whether this build knows the Assistant's service (the Apps page shows its row) */
export const assistantAvailable = () => !!ASSISTANT;

/** Server settings › Apps › Zrzur Assistant (web: assistant/AssistantPage) */
export function AssistantPage({ server, onBack }: { server: Server; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [ready, setReady] = useState(isConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const manage = server.havePermission("ManageServer");
  const expired = useCallback(() => setReady(false), []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      await connect(client);
      setReady(true);
    } catch {
      setError(t`Zrzur Assistant can't be reached right now. Try again soon.`);
    } finally {
      setBusy(false);
    }
  }, [client, t]);

  useEffect(() => {
    if (ready || !manage) return;
    let live = true;
    void alreadyAuthorized(client)
      .catch(() => false)
      .then((yes) => {
        if (yes && live) void signIn();
      });
    return () => {
      live = false;
    };
  }, [client, manage, ready, signIn]);

  if (ready && manage) return <Connected server={server} onBack={onBack} onExpired={expired} />;

  return (
    <SettingsPage title={t`Zrzur Assistant`} backLabel={t`Apps`} onBack={onBack} testID="server-assistant">
      {!manage ? (
        <AText size={13} line={20} color={palette.muted}>
          {t`Only people who manage the server can change this.`}
        </AText>
      ) : (
        <View style={{ gap: 8 }}>
          <RowGroup>
            <ControlRow
              first
              icon="robot"
              title={t`Connect Zrzur Assistant`}
              description={t`It learns your username, so it knows you may change these settings. You can remove it under Connected apps.`}
              control={<Button size="sm" label={t`Connect`} status={busy ? "submitting" : "ready"} onPress={() => void signIn()} testID="assistant-connect" />}
            />
          </RowGroup>
          <InlineError message={error} />
        </View>
      )}
    </SettingsPage>
  );
}

function Connected({ server, onBack, onExpired }: { server: Server; onBack: () => void; onExpired: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const words = useAssistantWords();
  const [meta, setMeta] = useState<ModuleMeta[]>();
  const [state, setState] = useState<AssistantServer>();
  const [loadError, setLoadError] = useState<AssistantError | Error>();
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState<string>();

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([assistantApi.meta(), assistantApi.server(server.id)])
      .then(([m, s]) => {
        if (!live) return;
        setMeta(m.modules.filter((module) => module.group !== "core"));
        setState(s);
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof AssistantError && err.status === 401) onExpired();
        else setLoadError(err as Error);
      });
    return () => {
      live = false;
    };
  }, [server.id, onExpired, attempt]);
  const load = () => setAttempt((n) => n + 1);

  /** Run a change; the page shows the server's answer, or says what went wrong */
  async function apply(run: () => Promise<{ config: AssistantConfig }>) {
    setError(undefined);
    try {
      const { config } = await run();
      setState((before) => (before ? { ...before, config } : before));
    } catch (err) {
      if (err instanceof AssistantError && err.status === 401) onExpired();
      else setError(t`That change wasn't saved. Check it and try again.`);
    }
  }
  const changeModule = (id: string, patch: Partial<ModuleState>) => apply(() => assistantApi.patchModule(server.id, id, patch));

  const current = meta?.find((module) => module.id === open);
  if (current && state)
    return <ModulePage server={server} module={current} state={state.config.modules[current.id]} error={error} onBack={() => setOpen(undefined)} onChange={(patch) => void changeModule(current.id, patch)} />;

  return (
    <SettingsPage title={t`Zrzur Assistant`} description={t`The official bot: safety, community and support in one place.`} backLabel={t`Apps`} onBack={onBack} testID="server-assistant">
      {loadError ? (
        loadError instanceof AssistantError && loadError.status === 404 ? (
          <View style={{ gap: 8, alignItems: "flex-start" }}>
            <AText size={13} line={20} color={palette.muted}>
              {t`Add Zrzur Assistant to this server first.`}
            </AText>
            <Button size="sm" variant="tonal" label={t`Add it`} onPress={() => router.push(`/bot/${ASSISTANT!.botId}` as never)} />
          </View>
        ) : (
          <View style={{ gap: 8, alignItems: "flex-start" }}>
            <InlineError message={t`Zrzur Assistant can't be reached right now. Try again soon.`} />
            <Button size="sm" variant="tonal" label={t`Try again`} onPress={() => {
                setLoadError(undefined);
                load();
              }} />
          </View>
        )
      ) : !state || !meta ? (
        <Loading />
      ) : (
        <>
          <InlineError message={error} />
          <SettingsSection title={t`Overview`} description={t`What the Assistant needs, and what happened lately.`}>
            <Health state={state} onRefresh={load} />
          </SettingsSection>

          <SettingsSection title={t`Quick setup`} description={t`Pick what your server is like; modules turn on to match.`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {state.presets.map((preset) => (
                <Button key={preset} variant="tonal" label={words.presets[preset] ?? preset} onPress={() => void apply(() => assistantApi.wizard(server.id, preset))} />
              ))}
            </View>
          </SettingsSection>

          {GROUPS.map((group) => {
            const modules = meta.filter((module) => module.group === group);
            if (!modules.length) return null;
            return (
              <SettingsSection key={group} title={words.groups[group] ?? group}>
                <RowGroup>
                  {modules.map((module, index) => {
                    const name = words.modules[module.id]?.name ?? module.id;
                    return (
                      <ControlRow
                        key={module.id}
                        first={index === 0}
                        title={name}
                        description={words.modules[module.id]?.line}
                        control={
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Toggle label={name} value={!!state.config.modules[module.id]?.enabled} onChange={(enabled) => void changeModule(module.id, { enabled })} testID={`assistant-module-${module.id}`} />
                            <Button size="sm" variant="tonal" label={t`Configure`} accessibilityLabel={t`Configure ${String(name)}`} onPress={() => setOpen(module.id)} />
                          </View>
                        }
                      />
                    );
                  })}
                </RowGroup>
              </SettingsSection>
            );
          })}

          <SettingsSection title={t`General`} description={t`Language, time and who counts as staff.`}>
            <Global server={server} config={state.config} onChange={(patch) => void apply(() => assistantApi.patchGlobal(server.id, patch))} />
          </SettingsSection>

          {state.overview.changes.length ? (
            <View style={{ gap: 4 }}>
              {state.overview.changes.map((change, index) => (
                <AText key={`${change.at}-${index}`} autoDir size={13} line={18} color={palette.muted}>
                  {`${new Date(change.at).toLocaleString()} ${change.what}`}
                </AText>
              ))}
            </View>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}

function Health({ state, onRefresh }: { state: AssistantServer; onRefresh: () => void }) {
  const { t } = useLingui();
  const words = useAssistantWords();
  const client = useClient();
  const missing = state.health?.missing ?? [];
  const above = state.health?.rolesAbove ?? [];
  const active = Object.keys(words.modules).filter((id) => state.config.modules[id]?.enabled);
  const userName = (id: string) => client.users.get(id)?.username ?? id;
  return (
    <RowGroup>
      <ControlRow
        first
        icon={missing.length ? "warning-circle" : "check-circle"}
        title={missing.length ? t`Some permissions are missing` : t`All permissions are in place`}
        description={missing.length ? missing.join(", ") : undefined}
        control={<Button size="sm" variant="tonal" label={t`Check again`} onPress={onRefresh} />}
      />
      {above.length ? <ControlRow icon="warning-circle" title={t`These roles are above the Assistant`} description={above.join(", ")} control={null} /> : null}
      <ControlRow title={t`Active modules`} description={active.map((id) => words.modules[id].name).join("، ") || undefined} control={null} />
      <ControlRow
        title={t`Recent cases`}
        description={state.overview.cases.map((row) => `#${row.number} ${words.cases[row.action] ?? row.action} · ${userName(row.target)}`).join("، ") || undefined}
        control={null}
      />
      <ControlRow title={t`Recent tickets`} description={state.overview.tickets.map((row) => `#${row.number} · ${userName(row.user)}`).join("، ") || undefined} control={null} />
    </RowGroup>
  );
}

function Global({ server, config, onChange }: { server: Server; config: AssistantConfig; onChange: (patch: Record<string, unknown>) => void }) {
  const { t } = useLingui();
  const words = useAssistantWords();
  const roles = useChoices(server).roles;
  const [picking, setPicking] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const language = LANGUAGES.find(([id]) => id === config.global.language)?.[1] ?? config.global.language;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <FieldLabel>{t`Language of the bot's messages`}</FieldLabel>
        <SelectField label={t`Language of the bot's messages`} value={language} onPress={() => setPicking(true)} />
      </View>
      <TextField
        label={t`Time zone`}
        value={zone ?? config.global.timezone}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ writingDirection: "ltr" }}
        onChangeText={setZone}
        onEndEditing={() => {
          if (zone !== null && zone !== config.global.timezone) onChange({ timezone: zone });
          setZone(null);
        }}
      />
      <RowGroup>
        <ControlRow first title={t`Use the Hijri calendar`} control={<Toggle label={t`Use the Hijri calendar`} value={config.global.hijri} onChange={(hijri) => onChange({ hijri })} />} />
      </RowGroup>
      {(Object.keys(words.tiers) as (keyof Staff)[]).map((tier) => (
        <PickMany key={tier} label={words.tiers[tier]} value={config.global.staff[tier] ?? []} choices={roles} onChange={(value) => onChange({ staff: { [tier]: value } })} />
      ))}
      <PickerSheet
        visible={picking}
        title={t`Language of the bot's messages`}
        value={config.global.language}
        options={LANGUAGES.map(([id, name]) => ({ value: id as string, label: name }))}
        onPick={(value) => onChange({ language: value })}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function ModulePage({
  server,
  module,
  state,
  error,
  onBack,
  onChange,
}: {
  server: Server;
  module: ModuleMeta;
  state: ModuleState | undefined;
  error?: string;
  onBack: () => void;
  onChange: (patch: Partial<ModuleState>) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const words = useAssistantWords();
  const choices = useChoices(server);
  const [tab, setTab] = useState<ModuleTab>("settings");
  const [asking, setAsking] = useState(false);
  const name = words.modules[module.id]?.name ?? module.id;
  const current: ModuleState = state ?? { enabled: false, disabledAt: null, logChannel: null, allowRoles: [], allowChannels: [], settings: {}, messages: {} };
  const purge = purgeDate(current.disabledAt);

  return (
    <SettingsPage title={name} description={words.modules[module.id]?.line} backLabel={t`Zrzur Assistant`} onBack={onBack} testID={`assistant-page-${module.id}`}>
      <RowGroup>
        <ControlRow first title={name} control={<Toggle label={name} value={current.enabled} onChange={(enabled) => onChange({ enabled })} />} />
      </RowGroup>
      <InlineError message={error} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        <Segmented label={t`Module sections`} value={tab} options={tabsOf(module).map((value) => ({ value, label: words.tabs[value] }))} onChange={setTab} />
      </ScrollView>

      <View style={{ gap: 16 }}>
        {tab === "settings" ? (
          module.fields.length ? (
            module.fields.map((field) => (
              <FieldControl key={field.key} module={module.id} field={field} value={current.settings[field.key]} choices={choices} onChange={(value) => onChange({ settings: { [field.key]: value } })} />
            ))
          ) : (
            <Muted>{t`This module has no settings. Use its slash commands.`}</Muted>
          )
        ) : tab === "messages" ? (
          <>
            <Muted>{t`Leave a box empty to use the standard text.`}</Muted>
            {module.messages.map((message) => (
              <View key={message.key} style={{ gap: 8 }}>
                <AText size={15} line={20} weight="semibold" color={palette.fg}>
                  {words.messages[message.key] ?? message.key}
                </AText>
                {LANGUAGES.map(([lang, language]) => (
                  <CommitField
                    key={lang}
                    label={language}
                    multiline
                    rtl={lang === "ar"}
                    placeholder={message.defaults?.[lang]}
                    value={current.messages[message.key]?.[lang] ?? ""}
                    onCommit={(text) => onChange({ messages: { [message.key]: { ...current.messages[message.key], [lang]: text } } })}
                  />
                ))}
              </View>
            ))}
          </>
        ) : tab === "permissions" ? (
          <>
            <Muted>{t`Empty lists follow the staff levels and work everywhere.`}</Muted>
            <PickMany label={t`Roles that may use this module`} value={current.allowRoles} choices={choices.roles} onChange={(allowRoles) => onChange({ allowRoles })} />
            <PickMany label={t`Channels where its commands work`} value={current.allowChannels} choices={choices.channels} onChange={(allowChannels) => onChange({ allowChannels })} />
          </>
        ) : tab === "log" ? (
          <PickOne label={t`Log channel`} value={current.logChannel} choices={choices.channels} onChange={(logChannel) => onChange({ logChannel })} />
        ) : (
          <>
            <Muted>{t`Data of a module that stays off is deleted after 30 days. The server owner gets a copy first. No IP addresses are ever kept.`}</Muted>
            {purge ? <Muted>{t`This module's data will be deleted on ${purge.toLocaleDateString(i18n.locale)}.`}</Muted> : null}
            <View style={{ alignItems: "flex-start" }}>
              <Button variant="danger" label={t`Delete data now`} onPress={() => setAsking(true)} />
            </View>
          </>
        )}
      </View>

      <ConfirmDialog
        visible={asking}
        title={t`Delete this module's data?`}
        text={t`This can't be undone.`}
        confirm={t`Delete data`}
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          await assistantApi.purgeModule(server.id, module.id);
        }}
      />
    </SettingsPage>
  );
}

function Muted({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <AText size={13} line={20} color={palette.muted}>
      {children}
    </AText>
  );
}

/** The server's text channels and roles, for the pickers */
function useChoices(server: Server): { channels: Choice[]; roles: Choice[] } {
  return (
    useFields(server, (s) => ({
      channels: s.channels.filter((channel) => channel.type === "TextChannel").map((channel) => ({ id: channel.id, name: channel.name ?? channel.id })),
      roles: s.orderedRoles.map((role) => ({ id: role.id, name: role.name })),
    })) ?? { channels: [], roles: [] }
  );
}

/** A text field that saves when typing ends (web: change, not input) */
function CommitField({
  label,
  value,
  onCommit,
  multiline,
  numeric,
  rtl,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  multiline?: boolean;
  numeric?: boolean;
  rtl?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextField
      label={label}
      value={text ?? value}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={numeric ? "number-pad" : "default"}
      style={[multiline ? { minHeight: 80, textAlignVertical: "top" } : null, rtl !== undefined ? inputSideStyle(rtl ? "rtl" : "ltr") : null]}
      onChangeText={setText}
      onEndEditing={() => {
        if (text !== null && text !== value) onCommit(text);
        setText(null);
      }}
    />
  );
}

/** One channel or role from a list, or none */
function PickOne({ label, value, choices, onChange }: { label: string; value?: string | null; choices: Choice[]; onChange: (value: string | null) => void }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const shown = choices.find((choice) => choice.id === value)?.name ?? t`None`;
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <SelectField label={label} value={shown} onPress={() => setOpen(true)} />
      <PickerSheet
        visible={open}
        title={label}
        value={value ?? ""}
        options={[{ value: "", label: t`None` }, ...choices.map((choice) => ({ value: choice.id, label: choice.name }))]}
        onPick={(picked) => onChange(picked || null)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/** Several channels or roles: chips to remove, a menu to add */
function PickMany({ label, value, choices, onChange }: { label: string; value: string[]; choices: Choice[]; onChange: (value: string[]) => void }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) => choices.find((choice) => choice.id === id)?.name ?? id;
  const left = choices.filter((choice) => !value.includes(choice.id));
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <SelectField label={label} value={t`Add…`} disabled={!left.length} onPress={() => setOpen(true)} />
      {value.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {value.map((id) => (
            <Button key={id} size="sm" variant="tonal" icon="x" label={nameOf(id)} accessibilityLabel={t`Remove ${nameOf(id)}`} onPress={() => onChange(value.filter((item) => item !== id))} />
          ))}
        </View>
      ) : null}
      <PickerSheet visible={open} title={label} value="" options={left.map((choice) => ({ value: choice.id, label: choice.name }))} onPick={(id) => id && onChange([...value, id])} onClose={() => setOpen(false)} />
    </View>
  );
}

/** One setting of a module, saved as soon as it changes (web: AssistantFields FieldControl) */
function FieldControl({
  module,
  field,
  value,
  choices,
  onChange,
}: {
  module: string;
  field: Field;
  value: unknown;
  choices: { channels: Choice[]; roles: Choice[] };
  onChange: (value: unknown) => void;
}) {
  const words = useAssistantWords();
  const [open, setOpen] = useState(false);
  const id = `${module}.${field.key}`;
  const label = words.fields[id] ?? field.key;
  const choiceName = (option: string | number) => words.options[`${id}.${option}`] ?? String(option);

  switch (field.type) {
    case "bool":
      return (
        <RowGroup>
          <ControlRow first title={label} control={<Toggle label={label} value={!!value} onChange={onChange} />} />
        </RowGroup>
      );
    case "int":
    case "enum":
      if (field.options) {
        const shown = field.type === "enum" ? choiceName(value as string) : String(value ?? "");
        return (
          <View style={{ gap: 8 }}>
            <FieldLabel>{label}</FieldLabel>
            <SelectField label={label} value={shown} onPress={() => setOpen(true)} />
            <PickerSheet
              visible={open}
              title={label}
              value={String(value)}
              options={field.options.map((option) => ({ value: String(option), label: field.type === "enum" ? choiceName(option) : String(option) }))}
              onPick={(picked) => onChange(field.type === "int" ? Number(picked) : picked)}
              onClose={() => setOpen(false)}
            />
          </View>
        );
      }
      return (
        <CommitField
          label={label}
          numeric
          value={String(value ?? "")}
          onCommit={(text) => {
            const number = Number(text);
            if (Number.isInteger(number)) onChange(number);
          }}
        />
      );
    case "channel":
      return <PickOne label={label} value={value as string | null} choices={choices.channels} onChange={onChange} />;
    case "role":
      return <PickOne label={label} value={value as string | null} choices={choices.roles} onChange={onChange} />;
    case "channels":
      return <PickMany label={label} value={(value as string[]) ?? []} choices={choices.channels} onChange={onChange} />;
    case "roles":
      return <PickMany label={label} value={(value as string[]) ?? []} choices={choices.roles} onChange={onChange} />;
    case "list":
      if (field.options)
        return <PickMany label={label} value={(value as string[]) ?? []} choices={field.options.map((option) => ({ id: String(option), name: choiceName(option) }))} onChange={onChange} />;
      return <CommitField label={label} multiline value={((value as string[]) ?? []).join("\n")} onCommit={(text) => onChange(linesOf(text))} />;
    case "text":
      return <CommitField label={label} value={String(value ?? "")} onCommit={onChange} />;
  }
}
