import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, Button, Chip, GroupRow, RowGroup, SheetModal, TextField } from "@/ui/kit";
import { InlineError } from "@/ui/settings/parts";

import { FieldLabel, PickField } from "./FormParts";
import { collectOptions, type FieldValue, levelOf, type OptionResult, wrapOptions } from "./logic";
import { menuOptions } from "./SelectSheet";
import { AutocompleteTimeout, requestAutocomplete, runCommand, uploadOptionFile } from "./store";
import { type ApplicationCommand, type CommandOption, commandName, localized, type OptionChoice } from "./types";

/**
 * A picked command's options as a form above the keyboard (web: the
 * CommandBar; on a phone a sheet, not inline `name:value` tokens):
 * sub-commands first as a list, then the fields, required ones first.
 * Run sends the interaction; the answer shows in the chat.
 */
export function CommandForm({ channel, command, onClose, onDone }: { channel: Channel; command: ApplicationCommand; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [path, setPath] = useState<CommandOption[]>([]);
  const [fields, setFields] = useState<Record<string, FieldValue>>({});
  const [error, setError] = useState<string>();
  const [bad, setBad] = useState<string>();
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState<string>();
  const label = (o: { name: string; name_localizations?: Record<string, string> }) => localized(o.name, o.name_localizations, i18n.locale);
  const level = levelOf(path.length ? path[path.length - 1].options : command.options);
  const serverId = channel.serverId || undefined;

  const set = (name: string, value: FieldValue) => {
    setFields((f) => ({ ...f, [name]: value }));
    setError(undefined);
    setBad(undefined);
  };

  const problem = (o: CommandOption, kind: NonNullable<OptionResult["error"]>) => {
    const name = label(o);
    switch (kind) {
      case "missing":
        return t`Fill in "${label(o)}".`;
      case "number":
        return t`"${name}" needs a number.`;
      case "choice":
        return t`Choose one of the listed values for "${name}".`;
      case "pick":
        return t`Choose "${name}" from the list.`;
      case "file":
        return t`Upload a file for "${name}".`;
    }
  };

  async function run() {
    if (sending) return;
    if (level.subs.length) {
      setError(t`Choose a sub-command first.`);
      return;
    }
    const result = collectOptions(level.fields, fields);
    if (result.failed) {
      setBad(result.failed.option.name);
      setError(problem(result.failed.option, result.failed.error));
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      await runCommand(client, channel.id, command, wrapOptions(path, result.options));
      onDone();
    } catch (err) {
      setSending(false);
      const type = (err as { type?: string } | null)?.type;
      setError(type === "FailedValidation" ? t`Some of the values are not valid.` : t`The command could not be used.`);
    }
  }

  async function pickFile(o: CommandOption) {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const a = result.assets[0];
    setUploading(o.name);
    try {
      const id = await uploadOptionFile(client, { uri: a.uri, name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size });
      set(o.name, { value: id, label: a.name });
    } catch {
      setError(t`The file could not be uploaded. It may be too large.`);
    } finally {
      setUploading(undefined);
    }
  }

  const description = localized(command.description ?? "", command.description_localizations, i18n.locale);

  return (
    <SheetModal visible onClose={onClose} grabber handleOnly testID="command-form" detents={[0.75]}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 }}>
          <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header" style={{ writingDirection: "ltr" }}>
            {`/${[commandName(command, i18n.locale), ...path.map(label)].join(" ")}`}
          </AText>
          {description ? (
            <AText autoDir size={13} line={18} color={palette.muted}>
              {description}
            </AText>
          ) : null}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {level.subs.length ? (
            <View style={{ gap: 8 }}>
              <AText size={13} line={20} weight="semibold" color={palette.fg2}>
                {t`Choose a sub-command`}
              </AText>
              <RowGroup>
                {level.subs.map((s, i) => (
                  <GroupRow
                    key={s.name}
                    first={i === 0}
                    label={label(s)}
                    value={localized(s.description, s.description_localizations, i18n.locale)}
                    chevron
                    testID={`command-sub-${s.name}`}
                    onPress={() => {
                      setPath((p) => [...p, s]);
                      setError(undefined);
                    }}
                  />
                ))}
              </RowGroup>
            </View>
          ) : (
            level.fields.map((o) => (
              <OptionField
                key={o.name}
                option={o}
                label={label(o)}
                field={fields[o.name]}
                invalid={bad === o.name}
                uploading={uploading === o.name}
                onChange={(v) => set(o.name, v)}
                onPickFile={() => void pickFile(o)}
                autocomplete={
                  o.autocomplete
                    ? (signal) =>
                        requestAutocomplete(client, channel.id, command, wrapOptions(path, collectOptions(level.fields.filter((x) => x.name !== o.name && fields[x.name]), fields).options), o.name, signal)
                    : undefined
                }
                serverId={serverId}
              />
            ))
          )}
          <InlineError message={error} />
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.divider }}>
          {path.length ? <Button variant="ghost" label={t`Back`} onPress={() => setPath((p) => p.slice(0, -1))} /> : null}
          <Button variant="ghost" label={t`Cancel`} onPress={onClose} testID="command-form-cancel" />
          <Button label={sending ? t`Sending…` : t`Run`} icon="lightning" status={sending ? "submitting" : "ready"} disabled={!!level.subs.length || !!uploading} onPress={() => void run()} testID="command-form-run" />
        </View>
      </View>
    </SheetModal>
  );
}

function OptionField({
  option,
  label,
  field,
  invalid,
  uploading,
  onChange,
  onPickFile,
  autocomplete,
  serverId,
}: {
  option: CommandOption;
  label: string;
  field?: FieldValue;
  invalid: boolean;
  uploading: boolean;
  onChange: (v: FieldValue) => void;
  onPickFile: () => void;
  autocomplete?: (signal: AbortSignal) => Promise<OptionChoice[]>;
  serverId?: string;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const description = localized(option.description, option.description_localizations, i18n.locale);
  const optional = !option.required;

  // the bot's suggestions while typing (debounced; a newer key aborts the older ask)
  const [suggest, setSuggest] = useState<{ state: "idle" | "asking" | "ready" | "timeout" | "error"; choices: OptionChoice[] }>({ state: "idle", choices: [] });
  const abort = useRef<AbortController | null>(null);
  const text = field?.text ?? "";
  const ask = useRef(autocomplete);
  useEffect(() => {
    ask.current = autocomplete;
  });
  useEffect(() => {
    if (!ask.current || field?.value !== undefined) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    const timer = setTimeout(() => {
      setSuggest((s) => ({ ...s, state: "asking" }));
      ask.current?.(controller.signal).then(
        (choices) => !controller.signal.aborted && setSuggest({ state: "ready", choices }),
        (err) => !controller.signal.aborted && setSuggest({ state: err instanceof AutocompleteTimeout ? "timeout" : "error", choices: [] }),
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, field?.value]);

  const pickOptions = useMemo(() => {
    if (option.choices?.length) return option.choices.map((c) => ({ value: String(c.value), label: localized(c.name, c.name_localizations, i18n.locale) }));
    if (["User", "Role", "Channel", "Mentionable"].includes(option.type)) {
      const kind = option.type === "User" ? "UserSelect" : option.type === "Role" ? "RoleSelect" : option.type === "Channel" ? "ChannelSelect" : "MentionableSelect";
      return menuOptions(client, { type: kind, channel_types: option.channel_types }, serverId);
    }
    return undefined;
  }, [option, client, serverId, i18n.locale]);

  if (option.type === "Boolean") {
    return (
      <View style={{ gap: 8 }}>
        <FieldLabel label={label} description={description} optional={optional} />
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
          <Chip radio label={t`Yes`} selected={field?.value === true} onPress={() => onChange({ value: true, label: t`Yes` })} testID={`command-option-${option.name}-yes`} />
          <Chip radio label={t`No`} selected={field?.value === false} onPress={() => onChange({ value: false, label: t`No` })} testID={`command-option-${option.name}-no`} />
        </View>
      </View>
    );
  }
  if (option.type === "Attachment") {
    return (
      <View style={{ gap: 8 }}>
        <FieldLabel label={label} description={description} optional={optional} />
        {field?.label ? (
          <AText autoDir size={14} line={20} color={palette.fg} numberOfLines={1}>
            {field.label}
          </AText>
        ) : null}
        <Button variant="tonal" icon="file" label={uploading ? t`Uploading…` : t`Choose a file`} disabled={uploading} onPress={onPickFile} testID={`command-option-${option.name}`} />
      </View>
    );
  }
  if (pickOptions) {
    const choices = option.choices;
    return (
      <View style={{ gap: 8 }}>
        <FieldLabel label={label} description={description} optional={optional} />
        <PickField
          label={label}
          options={pickOptions}
          values={field?.value !== undefined ? [String(field.value)] : []}
          onChange={([v]) => {
            const choice = choices?.find((c) => String(c.value) === v);
            onChange({ value: choice ? choice.value : v, label: pickOptions.find((o) => o.value === v)?.label });
          }}
          invalid={invalid}
          testID={`command-option-${option.name}`}
        />
      </View>
    );
  }
  const numeric = option.type === "Integer" || option.type === "Number";
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={optional ? `${label} · ${t`optional`}` : label}
        helper={description}
        value={field?.value !== undefined ? (field.label ?? String(field.value)) : text}
        onChangeText={(next) => onChange({ text: next })}
        keyboardType={numeric ? (option.type === "Integer" ? "number-pad" : "decimal-pad") : "default"}
        maxLength={option.max_length ?? undefined}
        testID={`command-option-${option.name}`}
      />
      {autocomplete && field?.value === undefined ? (
        suggest.state === "asking" ? (
          <AText size={12} line={16} color={palette.muted}>
            {t`Asking the bot for suggestions…`}
          </AText>
        ) : suggest.state === "timeout" ? (
          <AText size={12} line={16} color={palette.muted}>
            {t`The bot did not answer. Type a value yourself.`}
          </AText>
        ) : suggest.state === "error" ? (
          <AText size={12} line={16} color={palette.muted}>
            {t`Couldn't get suggestions. Type a value yourself.`}
          </AText>
        ) : suggest.state === "ready" && !suggest.choices.length && text ? (
          <AText size={12} line={16} color={palette.muted}>
            {t`No suggestions match. You can still type a value.`}
          </AText>
        ) : suggest.choices.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {suggest.choices.map((c) => {
              const name = localized(c.name, c.name_localizations, i18n.locale);
              return <Chip key={String(c.value)} label={name} onPress={() => onChange({ value: c.value, label: name })} />;
            })}
          </View>
        ) : null
      ) : null}
    </View>
  );
}
