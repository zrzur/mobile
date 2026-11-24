import { useLingui } from "@lingui/react/macro";
import type { Emoji, Server } from "@zrzur/sdk/solid";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Button } from "@/ui/kit";
import { describeError } from "@/auth/errorText";
import { Icon } from "@/ui/Icon";

import { ConfirmDialog, SettingsPage, SettingsSection } from "../parts";
import { EmptyCard, RowTool } from "./controls";

const NAME = /^[a-z0-9_]{1,32}$/;
const LIMIT = 100;

/** Emoji (web: settings › Emoji, EmojiList) */
export function EmojiPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const manage = server.havePermission("ManageCustomisation");
  const json = useSolid(
    useCallback(() => JSON.stringify(server.emojis.map((e) => ({ id: e.id, name: e.name, url: e.url, by: e.creator?.displayName ?? e.creator?.username ?? "" }))), [server]),
  );
  const emojis = JSON.parse(json) as { id: string; name: string; url: string; by: string }[];
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [editError, setEditError] = useState<string>();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const left = Math.max(0, LIMIT - emojis.length);
  const limit = LIMIT;
  const count = emojis.length;
  const nameError = name && !NAME.test(name) ? t`Use lowercase letters, numbers and underscores.` : undefined;
  const find = (id: string) => server.emojis.find((e) => e.id === id) as Emoji | undefined;
  const deletingName = deleting?.name ?? "";

  const upload = async () => {
    if (!file || !NAME.test(name)) return;
    setBusy(true);
    setError(undefined);
    try {
      const id = await client.uploadFile("emojis", file as unknown as File);
      await server.createEmoji(id, { name } as never);
      setFile(null);
      setName("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title={t`Emoji`} description={t`The server's own emoji.`} testID="server-emoji">
      <SettingsSection title={t`Upload emoji`} description={t`${left} of ${limit} slots left. Members use them as :name:.`} readOnly={manage ? undefined : t`Manage customisation`}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t`Choose emoji image`}
              onPress={async () => {
                const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
                if (r.canceled) return;
                const a = r.assets[0];
                setFile({ uri: a.uri, name: a.fileName ?? "emoji.png", type: a.mimeType ?? "image/png" });
              }}
              style={({ pressed }) => ({ width: 44, height: 44, marginTop: 28, borderRadius: 10, backgroundColor: palette.field, borderWidth: 1, borderColor: pressed ? palette.fieldBorderHover : palette.fieldBorder, alignItems: "center", justifyContent: "center", overflow: "hidden" })}
            >
              {file ? <Image source={{ uri: file.uri }} style={{ width: 36, height: 36 }} contentFit="contain" /> : <Icon name="image" size={20} color={palette.iconMuted} />}
            </Pressable>
            <View style={{ flex: 1 }}>
              <TextField label={t`Name`} placeholder="party_parrot" value={name} onChangeText={(v) => setName(v.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={32} error={nameError ?? error} testID="emoji-name" />
            </View>
          </View>
          <AText size={13} line={18} color={palette.muted}>
            {t`A square image, then a name with lowercase letters, numbers and underscores.`}
          </AText>
          <Button testID="emoji-upload" label={busy ? t`Uploading…` : t`Upload`} icon="upload-simple" status={busy ? "submitting" : "ready"} disabled={!file || !NAME.test(name) || left === 0} onPress={() => void upload()} fill />
        </View>
      </SettingsSection>

      <SettingsSection title={t`${count} uploaded`}>
        {emojis.length === 0 ? (
          <EmptyCard icon="smiley" title={t`No custom emojis yet`} text={t`Upload one above to get started.`} />
        ) : (
          <RowGroup>
            {emojis.map((e, i) => {
              const by = e.by;
              return (
                <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingStart: 16, paddingEnd: 4, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                  <Image source={{ uri: e.url }} style={{ width: 32, height: 32 }} contentFit="contain" />
                  <View style={{ flex: 1, paddingVertical: 8 }}>
                    <AText size={16} line={22} weight="medium" color={palette.fg} style={{ writingDirection: "ltr" }} numberOfLines={1}>
                      :{e.name}:
                    </AText>
                    {by ? (
                      <AText size={13} line={18} color={palette.muted} numberOfLines={1}>
                        {t`Added by ${by}`}
                      </AText>
                    ) : null}
                  </View>
                  {manage ? (
                    <>
                      <RowTool
                        icon="pencil-simple"
                        label={t`Edit emoji`}
                        onPress={() => {
                          setEditing({ id: e.id, name: e.name });
                          setNewName(e.name);
                          setEditError(undefined);
                        }}
                      />
                      <RowTool icon="trash" danger label={t`Delete emoji`} onPress={() => setDeleting({ id: e.id, name: e.name })} />
                    </>
                  ) : null}
                </View>
              );
            })}
          </RowGroup>
        )}
      </SettingsSection>

      <Sheet visible={!!editing} onClose={() => setEditing(null)}>
        <AText size={18} line={26} weight="bold" color={palette.header}>
          {t`Rename emoji`}
        </AText>
        <TextField label={t`Emoji name`} value={newName} onChangeText={(v) => setNewName(v.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={32} error={newName && !NAME.test(newName) ? t`Use lowercase letters, numbers and underscores.` : editError} />
        <Button
            label={t`Save changes`}
            fill
            testID="emoji-rename-save"
            disabled={!NAME.test(newName)}
            onPress={async () => {
              if (!editing) return;
              try {
                await find(editing.id)?.edit({ name: newName } as never);
                setEditing(null);
              } catch (err) {
                setEditError(describeError(err));
              }
            }}
          />
      </Sheet>

      <ConfirmDialog
        visible={!!deleting}
        title={t`Delete :${deletingName}:?`}
        text={t`Deleting this emoji will disallow future use. All past uses will remain.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await server.deleteEmoji(deleting.id);
        }}
      />
    </SettingsPage>
  );
}
