import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";

import { PermissionList } from "../PermissionEditor";
import { SaveBar, SettingsPage } from "../parts";
import type { ChannelData } from "./data";

/**
 * Group › Permissions (web: ChannelPermissionsEditor type "group"): one
 * value for every member but the owner, as toggles under the web's headings
 * and group wording; rows you do not hold yourself are locked. Saved with
 * PATCH /channels/{id}/permissions/default.
 */
export function GroupPermissions({ channel, data, onBack }: { channel: Channel; data: ChannelData; onBack: () => void }) {
  const { t } = useLingui();
  const initial = data.groupPermissions;
  const [allow, setAllow] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const dirty = allow !== initial;

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await channel.setPermissions(undefined, Number(allow));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title={t`Permissions`}
      backLabel={data.name}
      onBack={onBack}
      testID="channel-permissions"
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          error={error}
          onReset={() => {
            setAllow(initial);
            setError(undefined);
          }}
          onSave={save}
        />
      }
    >
      <PermissionList tri={false} allow={allow} deny={0n} variant="group" held={data.held} disabled={saving} onChange={(a) => setAllow(a)} />
      {/* keeps the last rows clear of the save bar */}
      {dirty ? <View style={{ height: 48 }} /> : null}
    </SettingsPage>
  );
}
