import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { longDate } from "@/chat/time";
import { secureStorage } from "@/lib/secureStorage";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { SheetModal } from "@/ui/kit/Sheet";
import { AText } from "@/ui/kit/Text";

import { type ChangelogEntry, shouldShowChangelog, validChangelog } from "./noticeModel";

/**
 * Where the newest release note comes from (web: changelogFeed.ts). Off
 * until Zrzur's changelog service exists, exactly as on the web; Settings
 * keeps its "What's New" link to the blog meanwhile.
 */
export const CHANGELOG_ENDPOINT = "";

/** The id of the last release note seen on this device (web: ReleaseNotes store) */
const LAST_SEEN_KEY = "zrzur.releaseNotes.lastSeenId";

export async function fetchLatestChangelog(endpoint = CHANGELOG_ENDPOINT): Promise<ChangelogEntry | null> {
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return validChangelog(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * "What's new" after an update (web: Changelog modal): the newest release
 * note once, when it differs from the last one seen on this device. A
 * fresh install only remembers the current note and stays quiet.
 */
export function ChangelogSheet() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const latest = await fetchLatestChangelog();
      if (!latest || !live) return;
      const seen = await secureStorage.get(LAST_SEEN_KEY).catch(() => null);
      if (shouldShowChangelog(latest, seen) && live) setEntry(latest);
      void secureStorage.set(LAST_SEEN_KEY, latest.id).catch(() => {});
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!entry) return null;
  const published = new Date(entry.published_at);
  return (
    <SheetModal visible onClose={() => setEntry(null)} testID="changelog-dialog" panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="megaphone" size={22} color={palette.iconNeutral} />
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {t`What's new`}
        </AText>
      </View>
      {Number.isNaN(published.getTime()) ? null : (
        <AText size={14} line={20} color={palette.muted}>
          {longDate(published, i18n.locale)}
        </AText>
      )}
      <ScrollView style={{ flexGrow: 0, maxHeight: 420 }}>
        <AText autoDir size={15} line={22} weight="semibold" color={palette.fg}>
          {entry.title}
        </AText>
        <AText autoDir size={15} line={22} color={palette.fg2} selectable style={{ marginTop: 8 }}>
          {entry.markdown_content}
        </AText>
      </ScrollView>
      <Button label={t`Close`} variant="tonal" onPress={() => setEntry(null)} fill />
    </SheetModal>
  );
}
