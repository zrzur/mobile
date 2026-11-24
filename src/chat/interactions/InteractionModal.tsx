import { useLingui } from "@lingui/react/macro";
import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, Button, Chip, SheetModal, TextField, Toggle } from "@/ui/kit";
import { InlineError } from "@/ui/settings/parts";

import { MessageContent } from "../MessageContent";
import { FieldLabel, PickField } from "./FormParts";
import { initialModalValue, modalAnswers, type ModalComponent, type ModalItem, modalItems, modalProblem, type ModalProblem, type ModalValue, toggleValue } from "./logic";
import { isSelect, menuOptions } from "./SelectSheet";
import { closeModal, submitModal, uploadOptionFile, useInteractionState } from "./store";
import type { Modal } from "./types";

/**
 * The form a bot opened (web: InteractionModal + InteractionModalForm): a
 * tall sheet with the bot's title, its text lines and fields (short and long
 * text, menus, radio and check groups, a check box, files), Cancel and
 * Submit. Answers go to that bot only. Mount once per chat screen; it shows
 * when a bot opens a form in this channel.
 */
export function InteractionModalHost({ channelId }: { channelId: string }) {
  const modal = useInteractionState((s) => s.modal);
  if (!modal || modal.channelId !== channelId) return null;
  return <ModalForm key={modal.id} id={modal.id} channelId={modal.channelId} modal={modal.modal} />;
}

function useProblemText() {
  const { t } = useLingui();
  return (p: ModalProblem) => {
    const label = p.label;
    switch (p.kind) {
      case "fill":
        return t`Fill in "${label}".`;
      case "short":
        return t`"${label}" needs at least ${p.min} characters.`;
      case "choose":
        return t`Choose an option for "${label}".`;
      case "atLeast": {
        const min = p.min;
        return t`Choose at least ${min} for "${label}".`;
      }
      case "file":
        return t`Add a file to "${label}".`;
    }
  };
}

function ModalForm({ id, channelId, modal }: { id: string; channelId: string; modal: Modal }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const problemText = useProblemText();
  const items = useMemo(() => modalItems(modal.components), [modal.components]);
  const fields = useMemo(() => items.flatMap((i) => (i.kind === "field" ? [i] : [])), [items]);
  const serverId = client.channels.get(channelId)?.serverId || undefined;
  const [values, setValues] = useState<Record<string, ModalValue>>(() => Object.fromEntries(fields.map((f) => [f.component.custom_id, initialModalValue(f.component)])));
  const [files, setFiles] = useState<Record<string, { id: string; name: string }[]>>({});
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [bad, setBad] = useState<string>();

  const set = (customId: string, value: ModalValue) => {
    setValues((v) => ({ ...v, [customId]: value }));
    setError(undefined);
    setBad(undefined);
  };

  async function addFiles(c: Extract<ModalComponent, { type: "FileUpload" }>) {
    const max = c.max_values ?? 1;
    const result = await DocumentPicker.getDocumentAsync({ multiple: max > 1, copyToCacheDirectory: true, type: c.file_types?.length ? c.file_types.map((x) => (x.startsWith(".") ? "*/*" : `${x}/*`)) : "*/*" });
    if (result.canceled) return;
    const have = files[c.custom_id] ?? [];
    if (have.length + result.assets.length > max) {
      setError(t`This field takes at most ${max} files.`);
      return;
    }
    setUploading((n) => n + 1);
    try {
      const added: { id: string; name: string }[] = [];
      for (const a of result.assets) {
        const fileId = await uploadOptionFile(client, { uri: a.uri, name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size });
        added.push({ id: fileId, name: a.name });
      }
      setFiles((f) => ({ ...f, [c.custom_id]: [...(f[c.custom_id] ?? []), ...added] }));
    } catch {
      setError(t`The file could not be uploaded. It may be too large.`);
    } finally {
      setUploading((n) => n - 1);
    }
  }

  async function submit() {
    if (sending || uploading) return;
    const fileIds = Object.fromEntries(Object.entries(files).map(([k, list]) => [k, list.map((f) => f.id)]));
    const problem = modalProblem(fields, values, fileIds);
    if (problem) {
      setError(problemText(problem));
      setBad(fields.find((f) => f.label === problem.label)?.component.custom_id);
      return;
    }
    setSending(true);
    try {
      await submitModal(client, id, channelId, modal.custom_id, modalAnswers(fields, values, fileIds));
      closeModal();
    } catch (err) {
      setSending(false);
      setError((err as { type?: string } | null)?.type === "InteractionExpired" ? t`This form has expired.` : t`The form could not be sent.`);
    }
  }

  const fieldView = (item: Extract<ModalItem, { kind: "field" }>) => {
    const c = item.component;
    const value = values[c.custom_id];
    const invalid = bad === c.custom_id;
    switch (c.type) {
      case "TextInput":
        return (
          <TextField
            label={item.label}
            helper={item.description}
            value={typeof value === "string" ? value : ""}
            onChangeText={(text) => set(c.custom_id, text)}
            placeholder={c.placeholder ?? undefined}
            maxLength={c.max_length ?? undefined}
            multiline={c.style === "Paragraph"}
            numberOfLines={c.style === "Paragraph" ? 5 : undefined}
            style={c.style === "Paragraph" ? { minHeight: 112, textAlignVertical: "top" } : undefined}
            error={invalid ? error : undefined}
            testID={`modal-field-${c.custom_id}`}
          />
        );
      case "Checkbox":
        return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel label={item.label} description={item.description} />
            </View>
            <Toggle label={item.label} value={!!value} onChange={(v) => set(c.custom_id, v)} testID={`modal-field-${c.custom_id}`} />
          </View>
        );
      case "RadioGroup":
      case "CheckboxGroup": {
        const multi = c.type === "CheckboxGroup";
        const list = multi ? (Array.isArray(value) ? value : []) : [];
        const max = multi ? (c.max_values ?? c.options.length) : 1;
        return (
          <View style={{ gap: 8 }}>
            <FieldLabel label={item.label} description={item.description} optional={c.required === false} />
            <View accessibilityRole={multi ? undefined : "radiogroup"} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {c.options.map((o) => (
                <Chip
                  key={o.value}
                  radio={!multi}
                  label={o.label}
                  selected={multi ? list.includes(o.value) : value === o.value}
                  onPress={() => set(c.custom_id, multi ? toggleValue(list, o.value, max) : o.value)}
                  testID={`modal-option-${c.custom_id}-${o.value}`}
                />
              ))}
            </View>
          </View>
        );
      }
      case "FileUpload": {
        const list = files[c.custom_id] ?? [];
        return (
          <View style={{ gap: 8 }}>
            <FieldLabel label={item.label} description={item.description} optional={c.required === false} />
            {list.map((f) => (
              <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AText autoDir size={14} line={20} color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                  {f.name}
                </AText>
                <Button
                  size="sm"
                  variant="ghost"
                  label={t`Remove`}
                  accessibilityLabel={t`Remove ${f.name}`}
                  onPress={() => setFiles((all) => ({ ...all, [c.custom_id]: (all[c.custom_id] ?? []).filter((x) => x.id !== f.id) }))}
                />
              </View>
            ))}
            <Button variant="tonal" icon="file" label={uploading ? t`Uploading…` : t`Choose a file`} disabled={!!uploading} onPress={() => void addFiles(c)} />
          </View>
        );
      }
      default:
        if (!isSelect(c)) return null;
        return (
          <View style={{ gap: 8 }}>
            <FieldLabel label={item.label} description={item.description} />
            <PickField
              label={item.label}
              options={menuOptions(client, c, serverId)}
              values={Array.isArray(value) ? value : []}
              min={c.min_values ?? 1}
              max={Math.max(1, c.max_values ?? 1)}
              placeholder={c.placeholder ?? undefined}
              onChange={(next) => set(c.custom_id, next)}
              invalid={invalid}
              testID={`modal-field-${c.custom_id}`}
            />
          </View>
        );
    }
  };

  return (
    <SheetModal visible onClose={closeModal} dismissible={false} grabber handleOnly testID="interaction-modal" detents={[0.92]}>
      <View style={{ flex: 1 }}>
        <AText autoDir size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header" style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          {modal.title}
        </AText>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {items.map((item, i) =>
            item.kind === "text" ? (
              <MessageContent key={`t${i}`} content={item.content} serverId={serverId} />
            ) : (
              <View key={item.component.custom_id}>{fieldView(item)}</View>
            ),
          )}
          <InlineError message={bad ? undefined : error} />
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.divider }}>
          <Button variant="ghost" label={t`Cancel`} onPress={closeModal} testID="interaction-modal-cancel" />
          <Button label={uploading ? t`Uploading…` : t`Submit`} status={sending ? "submitting" : "ready"} disabled={!!uploading} onPress={() => void submit()} testID="interaction-modal-submit" />
        </View>
      </View>
    </SheetModal>
  );
}
