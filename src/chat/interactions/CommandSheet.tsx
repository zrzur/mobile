import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText, Button, Chip, haptics, PressableRow, SearchField, SheetModal, Skeleton } from "@/ui/kit";

import { searchCommands } from "./logic";
import type { CommandsLoad } from "./store";
import { type ApplicationCommand, commandName, localized } from "./types";

/**
 * The commands of the bots here as a bottom sheet (the composer's Commands
 * button and the "+" tile; typing "/" keeps the list above the box, as on
 * the web): the title, a search field that brings the keyboard up only
 * when tapped, one rounded card per command ("/name" over "description ·
 * bot"), and Close. Chips filter by bot when there are several (web: the
 * picker's app rail). A tap picks the command: it runs at once when it asks
 * for nothing, else its form opens. The sheet rides up with the keyboard.
 */
export function CommandSheet({
  visible,
  load,
  nsfw,
  onClose,
  onPick,
}: {
  visible: boolean;
  load: CommandsLoad;
  /** an NSFW channel also offers the bots' NSFW commands */
  nsfw?: boolean;
  onClose: () => void;
  onPick: (command: ApplicationCommand) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [query, setQuery] = useState("");
  const [app, setApp] = useState<string>();
  const [opened, setOpened] = useState(visible);
  // a fresh search each time the sheet opens
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setQuery("");
      setApp(undefined);
    }
  }

  const text = useMemo(
    () => ({
      name: (c: ApplicationCommand) => commandName(c, i18n.locale),
      description: (c: ApplicationCommand) => localized(c.description ?? "", c.description_localizations, i18n.locale),
    }),
    [i18n.locale],
  );
  const all = useMemo(() => (load.list ? searchCommands(load.list, "", text, { nsfw }) : []), [load.list, text, nsfw]);
  const shown = useMemo(() => (load.list ? searchCommands(load.list, query, text, { app, nsfw }) : []), [load.list, query, text, app, nsfw]);
  // bots that have at least one command here, in list order
  const apps = useMemo(() => {
    const ids = new Set(all.map((e) => e.command.application_id));
    return (load.list?.applications ?? []).filter((a) => ids.has(a._id));
  }, [all, load.list]);

  const loading = load.status === "loading";
  const failed = load.status === "error" && !load.list;

  return (
    <SheetModal visible={visible} onClose={onClose} grabber handleOnly testID="command-sheet" panelStyle={{ flexShrink: 1 }}>
      <View style={{ flexShrink: 1, paddingHorizontal: 16, gap: 12 }}>
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {t`Commands`}
        </AText>
        {all.length > 0 || loading ? (
          <View style={{ flexDirection: "row" }}>
            <SearchField value={query} onChange={setQuery} placeholder={t`Search for a command`} testID="command-sheet-search" />
          </View>
        ) : null}
        {apps.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            accessibilityLabel={t`Filter commands by app`}
          >
            <Chip label={t`All apps`} selected={!app} onPress={() => setApp(undefined)} testID="command-sheet-app-all" />
            {apps.map((a) => (
              <Chip key={a._id} label={a.display_name ?? a.username} selected={app === a._id} onPress={() => setApp(a._id)} testID={`command-sheet-app-${a._id}`} />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView
          testID="command-sheet-list"
          accessibilityRole="list"
          accessibilityLabel={t`Commands`}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: 8 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {loading ? (
            <View accessible accessibilityLabel={t`Loading the commands…`} style={{ gap: 8 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ minHeight: 60, borderRadius: 12, padding: 12, gap: 8, backgroundColor: palette.field }}>
                  <Skeleton width={[96, 120, 80, 104][i]} height={14} />
                  <Skeleton width={(["70%", "55%", "62%", "48%"] as const)[i]} height={12} />
                </View>
              ))}
            </View>
          ) : failed ? (
            <View testID="command-sheet-error" style={{ gap: 12, paddingVertical: 8 }}>
              <AText size={14} line={20} color={palette.muted} accessibilityLiveRegion="polite">
                {t`Couldn't load the commands.`}
              </AText>
              <View style={{ flexDirection: "row" }}>
                <Button label={t`Try again`} variant="tonal" size="sm" onPress={load.retry} testID="command-sheet-retry" />
              </View>
            </View>
          ) : all.length === 0 ? (
            <AText testID="command-sheet-empty" size={14} line={20} color={palette.muted} style={{ paddingVertical: 8 }}>
              {t`No commands yet`}
            </AText>
          ) : shown.length === 0 ? (
            <AText testID="command-sheet-no-match" size={14} line={20} color={palette.muted} style={{ paddingVertical: 8 }} accessibilityLiveRegion="polite">
              {t`No commands match`}
            </AText>
          ) : (
            shown.map(({ command, name, description, bot }) => {
              const detail = [description, bot].filter(Boolean).join(" · ");
              return (
                <PressableRow
                  key={command._id}
                  testID={`command-row-${command.name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`/${name}`}
                  accessibilityHint={detail || undefined}
                  highlight={palette.navSelected}
                  onPress={() => {
                    haptics.selection();
                    onPick(command);
                  }}
                  style={{ minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, justifyContent: "center", gap: 2, backgroundColor: palette.field }}
                >
                  <AText autoDir={name} size={15} line={20} weight="bold" color={palette.fg} numberOfLines={1}>
                    {`/${name}`}
                  </AText>
                  {detail ? (
                    // a long description is cut, the bot's name always shows
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {description ? (
                        <AText autoDir={description} size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                          {description}
                        </AText>
                      ) : null}
                      {bot ? (
                        <AText autoDir={bot} size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 0, maxWidth: "45%" }}>
                          {description ? ` · ${bot}` : bot}
                        </AText>
                      ) : null}
                    </View>
                  ) : null}
                </PressableRow>
              );
            })
          )}
        </ScrollView>
        <Button label={t`Close`} variant="tonal" fill onPress={onClose} testID="command-sheet-close" />
      </View>
    </SheetModal>
  );
}
