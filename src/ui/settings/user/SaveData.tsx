import { useLingui } from "@lingui/react/macro";

import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";

import { ControlRow, SettingsPage, SettingsSection, Toggle } from "../parts";
import { useDevicePrefs } from "./devicePrefs";
import { InfoRow } from "./userParts";
import { SAVE_DATA_DEFAULTS, SAVE_DATA_KEY } from "./userPrefs";

/**
 * Save data (web: data page), kept on this device only. The list says what
 * changes; the media server's small-preview variant is not detected on the
 * phone, so the plain wording is used (no "Animated emoji show still." row).
 */
export function SaveDataPage() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [prefs, setPrefs, ready] = useDevicePrefs(SAVE_DATA_KEY, SAVE_DATA_DEFAULTS);
  return (
    <SettingsPage title={t`Save data`} testID="user-save-data">
      <View style={{ gap: 12 }}>
        <AText size={14} line={20} color={palette.muted}>
          {t`For weak or metered internet. The choice is kept on this device only, so your phone and your computer can differ.`}
        </AText>
        <RowGroup>
          <ControlRow
            first
            icon="cloud-arrow-down"
            title={t`Save data`}
            description={t`Uses less mobile data. You can load anything with a tap.`}
            control={<Toggle label={t`Save data`} value={prefs.enabled} disabled={!ready} onChange={(enabled) => setPrefs({ enabled })} testID="save-data-toggle" />}
          />
        </RowGroup>
      </View>
      <SettingsSection title={t`What changes while it is on`}>
        <RowGroup>
          <InfoRow first icon="image" text={t`Large pictures wait for a tap. Small ones load as usual.`} />
          <InfoRow icon="gif" text={t`GIFs and videos do not load or play until you tap them.`} />
          <InfoRow icon="link" text={t`Link previews show their text. Their pictures wait for a tap.`} />
          <InfoRow icon="user-circle" text={t`Avatars, server icons and banners load as previews, never as the animated original.`} />
          <InfoRow icon="sparkle" text={t`Animated decorations, nameplates and profile effects stay still.`} />
          <InfoRow icon="cloud-arrow-down" text={t`Nothing is downloaded ahead for screens you have not opened.`} />
          <InfoRow icon="microphone" text={t`In calls your voice is sent at a lower bitrate, and other people's cameras and screens wait for a tap.`} />
        </RowGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
