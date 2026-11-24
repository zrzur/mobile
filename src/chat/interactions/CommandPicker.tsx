import { useLingui } from "@lingui/react/macro";
import { memo, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { AText, Chip } from "@/ui/kit";

import { filterCommands } from "./logic";
import type { CommandsLoad } from "./store";
import { type ApplicationCommand, type CommandApplication, commandName, localized } from "./types";

/** A bot's picture from the command list */
function appAvatar(app: CommandApplication | undefined, base?: string) {
  const id = (app?.avatar as { _id?: string } | undefined)?._id;
  return id && base ? `${base.replace(/\/$/, "")}/avatars/${id}` : undefined;
}

/**
 * The list above the message box while the text is `/` and a word (web:
 * CommandPicker): the commands of the bots here, the ones whose names start
 * with the word first; chips filter by bot when there are several. A tap
 * picks a command (its options open as a form).
 */
export const CommandPicker = memo(function CommandPicker({
  load,
  query,
  mediaUrl,
  onPick,
}: {
  load: CommandsLoad;
  query: string;
  /** The file server, for the bots' pictures */
  mediaUrl?: string;
  onPick: (command: ApplicationCommand) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [app, setApp] = useState<string>();
  const label = (c: ApplicationCommand) => commandName(c, i18n.locale);
  const apps = useMemo(() => load.list?.applications ?? [], [load.list]);
  const list = useMemo(() => (load.list ? filterCommands(load.list.commands, query, label, app) : []), [load.list, query, app]); // eslint-disable-line react-hooks/exhaustive-deps
  const appOf = (id: string) => apps.find((a) => a._id === id);

  if (load.status === "none") return null;
  // nothing to offer: say so quietly only while loading or on failure
  if (load.status === "ready" && !load.list?.commands.some((c) => c.type === "ChatInput")) return null;

  return (
    <View
      testID="command-picker"
      accessibilityRole="list"
      accessibilityLabel={t`Commands`}
      style={{ maxHeight: 300, borderRadius: 14, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.popoverBorder, overflow: "hidden" }}
    >
      {load.status === "loading" ? (
        <AText size={14} line={20} color={palette.muted} style={{ padding: 12 }}>
          {t`Loading the commands…`}
        </AText>
      ) : load.status === "error" ? (
        <Pressable accessibilityRole="button" onPress={load.retry} style={{ minHeight: 44, padding: 12, justifyContent: "center" }}>
          <AText size={14} line={20} color={palette.muted}>
            {t`Couldn't load the commands.`}{" "}
            <AText size={14} line={20} weight="semibold" color={palette.accentText}>
              {t`Try again`}
            </AText>
          </AText>
        </Pressable>
      ) : (
        <>
          {apps.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 8 }} accessibilityLabel={t`Filter commands by app`}>
              <Chip label={t`All apps`} selected={!app} onPress={() => setApp(undefined)} />
              {apps.map((a) => (
                <Chip key={a._id} label={a.display_name ?? a.username} selected={app === a._id} onPress={() => setApp(a._id)} testID={`command-app-${a._id}`} />
              ))}
            </ScrollView>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
            {list.length === 0 ? (
              <AText size={14} line={20} color={palette.muted} style={{ padding: 12 }}>
                {t`No commands match`}
              </AText>
            ) : (
              list.map((c) => {
                const bot = appOf(c.application_id);
                const botName = bot?.display_name ?? bot?.username ?? "";
                const description = localized(c.description ?? "", c.description_localizations, i18n.locale);
                return (
                  <Pressable
                    key={c._id}
                    testID={`command-${c.name}`}
                    accessibilityRole="button"
                    accessibilityLabel={`/${label(c)}`}
                    accessibilityHint={description || undefined}
                    onPress={() => onPick(c)}
                    style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                  >
                    <Avatar url={appAvatar(bot, mediaUrl)} name={botName} size={28} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <AText size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1, writingDirection: "ltr" }}>
                          {`/${label(c)}`}
                        </AText>
                        <AText autoDir size={12} line={16} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                          {botName}
                        </AText>
                      </View>
                      {description ? (
                        <AText autoDir size={13} line={18} color={palette.fg2} numberOfLines={1}>
                          {description}
                        </AText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
});
