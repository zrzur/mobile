import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { GroupRow, RowGroup } from "@/ui/app/parts";

import { type ChannelKind, type Pair, type PermissionVariant } from "../overrides";
import { PermissionList, TriLegend } from "../PermissionEditor";
import { InlineError, SaveBar, SettingsPage } from "../parts";

/**
 * One override editor (web: ChannelPermissionsEditor for channel_default,
 * channel_role, channel_member and the category variants): the 3-state list
 * and one save bar. An empty override (allow 0, deny 0) removes it.
 */
export function OverrideEditor({
  title,
  backLabel,
  initial,
  held,
  variant,
  kind,
  onSave,
  onBack,
  testID,
  remove,
}: {
  title: string;
  backLabel: string;
  initial: Pair;
  /** your own permission value: rows you lack are locked */
  held: bigint;
  variant: Exclude<PermissionVariant, "server">;
  kind?: ChannelKind;
  onSave: (value: { allow: number; deny: number }) => Promise<unknown>;
  onBack: () => void;
  testID: string;
  /** a person's own override: a row that removes it (allow 0, deny 0) */
  remove?: { label: string };
}) {
  const [allow, setAllow] = useState(initial.a);
  const [deny, setDeny] = useState(initial.d);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const dirty = allow !== initial.a || deny !== initial.d;

  const save = async (value = { allow: Number(allow), deny: Number(deny) }) => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(value);
      onBack();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title={title}
      backLabel={backLabel}
      onBack={onBack}
      testID={testID}
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          error={error}
          onReset={() => {
            setAllow(initial.a);
            setDeny(initial.d);
            setError(undefined);
          }}
          onSave={() => void save()}
        />
      }
    >
      <TriLegend />
      <PermissionList
        tri
        allow={allow}
        deny={deny}
        variant={variant}
        kind={kind}
        held={held}
        disabled={saving}
        onChange={(a, d) => {
          setAllow(a);
          setDeny(d);
        }}
      />
      {remove ? (
        <RowGroup>
          <GroupRow first danger icon="trash" testID={`${testID}-remove`} label={remove.label} onPress={saving ? undefined : () => void save({ allow: 0, deny: 0 })} />
        </RowGroup>
      ) : null}
      {/* the save bar shows its own error; with nothing changed it is hidden */}
      {remove && !dirty ? <InlineError message={error} /> : null}
      {/* keeps the last rows clear of the save bar */}
      {dirty ? <View style={{ height: 48 }} /> : null}
    </SettingsPage>
  );
}
