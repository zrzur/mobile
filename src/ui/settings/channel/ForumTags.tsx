import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { TextField } from "@/ui/auth/parts";
import { EmojiPicker } from "@/ui/emoji/EmojiPicker";
import { Button, Icon } from "@/ui/kit";
import { PressScale } from "@/ui/kit/Press";
import { AText } from "@/ui/kit/Text";
import { TagEmoji } from "@/ui/threads/StartThreadSheet";

import { ControlRow, SaveBar, SettingsPage, SettingsSection, Toggle } from "../parts";
import { ListRow } from "../server/controls";
import { type EditTag, MAX_NAME, MAX_TAGS, newTagId, storedTags, tagEmojiOf, tagsBody, tagsDirty, tagsValid } from "./forumTagsLogic";

/**
 * A forum's tags (web: settings/channel/ForumTags): members pick up to five
 * for each post and everyone can filter by them; the forum can ask for at
 * least one on every post. Changes are saved together from the save bar.
 */
export function ForumTags({ channel, onBack, backLabel }: { channel: Channel; onBack: () => void; backLabel: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const saved = useFields(channel, (c) => ({ tags: storedTags(c.forum?.tags), requireTag: !!c.forum?.requireTag }));
  const [tags, setTags] = useState<EditTag[] | null>(null);
  const [requireTag, setRequireTag] = useState<boolean | null>(null);
  const [removing, setRemoving] = useState<string>();
  const [picking, setPicking] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  if (!saved) return null;

  const list = tags ?? saved.tags;
  const required = requireTag ?? saved.requireTag;
  const dirty = tagsDirty(list, saved.tags, required, saved.requireTag);
  const change = (id: string, patch: Partial<EditTag>) =>
    setTags(
      list.map((tag) => {
        if (tag.id !== id) return tag;
        const next = { ...tag, ...patch };
        if (!next.emoji) delete next.emoji;
        return next;
      }),
    );

  const reset = () => {
    setTags(null);
    setRequireTag(null);
    setRemoving(undefined);
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await channel.edit(tagsBody(list, required) as Parameters<typeof channel.edit>[0]);
      setTags(null);
      setRequireTag(null);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title={t`Tags`}
      backLabel={backLabel}
      onBack={onBack}
      testID="channel-forum-tags"
      footer={<SaveBar dirty={dirty && tagsValid(list)} saving={saving} error={error} onReset={reset} onSave={save} />}
    >
      <SettingsSection title={t`Tags`} description={t`Members pick up to five tags for each post, and everyone can filter posts by tag.`}>
        <RowGroup>
          {list.length ? null : <ControlRow first icon="bookmark-simple" title={t`No tags yet.`} description={t`Add one so members can sort posts.`} control={null} />}
          {list.map((tag, index) => (
            <View key={tag.id} testID={`forum-tag-${index}`} style={{ paddingHorizontal: 16, paddingVertical: 8, minHeight: 52, borderTopWidth: index || !list.length ? 1 : 0, borderTopColor: palette.divider, justifyContent: "center" }}>
              {removing === tag.id ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <AText autoDir size={15} line={20} weight="medium" color={palette.fg} accessibilityRole="alert" style={{ flex: 1 }} numberOfLines={2}>
                    {t`Remove “${tag.name || t`this tag`}”?`}
                  </AText>
                  <Button size="sm" variant="ghost" label={t`Keep`} onPress={() => setRemoving(undefined)} />
                  <Button
                    size="sm"
                    variant="danger"
                    label={t`Remove`}
                    testID={`forum-tag-remove-${index}`}
                    onPress={() => {
                      setTags(list.filter((one) => one.id !== tag.id));
                      setRemoving(undefined);
                    }}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={tag.emoji ? t`Change the emoji of ${tag.name}` : t`Choose an emoji`}
                    onPress={() => setPicking(tag.id)}
                    scale={0.94}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : palette.field })}
                  >
                    {tag.emoji ? <TagEmoji emoji={tag.emoji} size={20} /> : <Icon name="smiley" size={20} color={palette.iconNeutral} />}
                  </PressScale>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextField
                      label={t`Tag name`}
                      value={tag.name}
                      maxLength={MAX_NAME}
                      placeholder={t`Tag name`}
                      helper={`${tag.name.length}/${MAX_NAME}`}
                      onChangeText={(name) => change(tag.id, { name })}
                      testID={`forum-tag-name-${index}`}
                    />
                  </View>
                  {tag.emoji ? (
                    <PressScale
                      accessibilityRole="button"
                      accessibilityLabel={t`Remove the emoji`}
                      onPress={() => change(tag.id, { emoji: undefined })}
                      scale={0.94}
                      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
                    >
                      <Icon name="x" size={16} color={palette.iconNeutral} />
                    </PressScale>
                  ) : null}
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={t`Remove tag ${tag.name}`}
                    onPress={() => setRemoving(tag.id)}
                    scale={0.94}
                    testID={`forum-tag-trash-${index}`}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
                  >
                    <Icon name="trash" size={18} color={palette.danger} />
                  </PressScale>
                </View>
              )}
            </View>
          ))}
        </RowGroup>
        <View style={{ marginTop: 8 }}>
          {list.length >= MAX_TAGS ? (
            <AText size={13} line={18} color={palette.fg2}>
              {t`A forum has at most ${MAX_TAGS} tags.`}
            </AText>
          ) : (
            <RowGroup>
              <ListRow first icon="plus" title={t`Add tag`} testID="forum-tag-add" onPress={() => setTags([...list, { id: newTagId(), name: "" }])} />
            </RowGroup>
          )}
        </View>
      </SettingsSection>

      <SettingsSection title={t`Posting`}>
        <RowGroup>
          <ControlRow
            first
            icon="list-checks"
            title={t`Every post needs a tag`}
            description={t`New posts need at least one of the tags above.`}
            control={<Toggle label={t`Every post needs a tag`} value={required} onChange={setRequireTag} testID="forum-require-tag" />}
          />
        </RowGroup>
      </SettingsSection>

      <EmojiPicker
        visible={!!picking}
        onClose={() => setPicking(undefined)}
        onPick={(entry) => {
          const emoji = tagEmojiOf(entry);
          if (picking && emoji) change(picking, { emoji });
          setPicking(undefined);
        }}
        testID="forum-tag-emoji"
      />
    </SettingsPage>
  );
}
