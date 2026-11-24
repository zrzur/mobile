import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useChannel, useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote, ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { callStore } from "../call";
import { useStore } from "../store";
import { useRoomInfo } from "../useRoomInfo";
import { InCall } from "./InCall";
import { Lobby } from "./Lobby";

/**
 * A voice channel, stage, DM or group call page. Viewing it never changes
 * the call you are in; joining needs the explicit Join (web: VoiceChannel).
 */
export function VoicePage({ id }: { id: string | undefined }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(id);
  const name = useFields(channel, (c) => (c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? "")));
  const stage = useFields(channel, (c) => c.isStage);
  const inThisCall = useStore(callStore, (s) => s.status !== "idle" && s.channelId === id);
  const { info, reload } = useRoomInfo(channel);
  const server = !!channel?.serverId;

  return (
    <SafeAreaView testID="voice-page" style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      {!channel ? (
        <>
          <ScreenHeader back>{null}</ScreenHeader>
          <CenterNote icon="speaker-high">{t`That voice channel is no longer available.`}</CenterNote>
        </>
      ) : inThisCall ? (
        <InCall channel={channel} room={info} onRoomChanged={reload} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* web: ChannelHeader on a phone, the type glyph then the name */}
          <ScreenHeader back>
            {server ? <Icon name={stage ? "waveform" : "speaker-high"} size={22} color={palette.iconMuted} /> : null}
            <AText autoDir size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }} numberOfLines={1}>
              {name ?? ""}
            </AText>
          </ScreenHeader>
          <Lobby channel={channel} room={info} roomLoading={server && !info} />
        </View>
      )}
    </SafeAreaView>
  );
}
