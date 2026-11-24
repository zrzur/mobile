import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { fetchSoundboard, type SoundboardSound } from "@zrzur/sdk/solid/voiceExtras";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { call } from "../call";
import { Note, PillButton, SheetTitle } from "./parts";

/**
 * The server's sounds, played into the call for everyone in it (web:
 * soundboard/SoundboardPicker, phone placement). Sounds others play are
 * heard through the call controller.
 */
export function SoundboardSheet({ channel, visible, onClose }: { channel: Channel; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = channel.server;
  const [sounds, setSounds] = useState<SoundboardSound[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!visible || !server) return;
    let live = true;
    fetchSoundboard(client, server)
      .then((list) => {
        if (!live) return;
        setSounds(list.sounds);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [visible, client, server]);

  async function play(id: string) {
    if (playing) return;
    setError(undefined);
    setPlaying(id);
    try {
      await call.playSound(id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPlaying(undefined);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} testID="soundboard-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <SheetTitle>{t`Soundboard`}</SheetTitle>
        <Pressable
          testID="soundboard-close"
          accessibilityRole="button"
          accessibilityLabel={t`Close soundboard`}
          onPress={onClose}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="x" size={20} color={palette.iconMuted} />
        </Pressable>
      </View>
      {failed ? (
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <Note>{t`The sounds could not load. Close them and open them again.`}</Note>
          <PillButton label={t`Close`} onPress={onClose} />
        </View>
      ) : !sounds ? (
        <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
          <ActivityIndicator color={palette.accent} />
          <Note>{t`Loading…`}</Note>
        </View>
      ) : !sounds.length ? (
        <Note>{t`No sounds yet. People who manage the soundboard add them in Server settings, Soundboard.`}</Note>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
          {sounds.map((sound) => (
            <Pressable
              key={sound._id}
              testID={`sound-${sound._id}`}
              accessibilityRole="button"
              accessibilityLabel={sound.name}
              accessibilityState={{ disabled: !!playing, busy: playing === sound._id }}
              disabled={!!playing}
              onPress={() => void play(sound._id)}
              style={({ pressed }) => ({
                width: "31%",
                flexGrow: 1,
                minHeight: 64,
                borderRadius: 14,
                paddingHorizontal: 8,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: playing === sound._id ? palette.navSelected : pressed ? palette.tonalHover : palette.field,
                opacity: playing && playing !== sound._id ? 0.6 : 1,
              })}
            >
              {sound.emoji ? (
                <AText size={20} line={24} color={palette.fg}>
                  {sound.emoji}
                </AText>
              ) : (
                <Icon name="music-note" size={18} color={palette.iconMuted} />
              )}
              <AText autoDir size={13} line={18} weight="medium" color={palette.fg} numberOfLines={1} style={{ textAlign: "center" }}>
                {sound.name}
              </AText>
            </Pressable>
          ))}
        </View>
      )}
      {error ? <Note alert>{error}</Note> : null}
    </Sheet>
  );
}
