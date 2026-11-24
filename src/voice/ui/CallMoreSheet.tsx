import { useLingui } from "@lingui/react/macro";
import { Platform } from "react-native";

import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";

import { call, callStore } from "../call";
import { deafenLabel } from "../logic";
import { useStoreFields } from "../store";
import { ROUTE_ICON } from "./OutputSheet";
import { SheetTitle } from "./parts";
import { useVoiceText } from "./text";

/**
 * The call's "more" sheet (the bar's ... and its drag handle): what does not
 * fit the bar. Only what the web call has: sound output (phones), hearing,
 * screen share (Android), the soundboard (server calls) and the room
 * controls of a room you own. Each row closes this sheet first.
 */
export function CallMoreSheet({
  visible,
  live,
  onClose,
  onOutput,
  onSoundboard,
  onRoomControls,
}: {
  visible: boolean;
  live: boolean;
  onClose: () => void;
  onOutput: () => void;
  onSoundboard?: () => void;
  onRoomControls?: () => void;
}) {
  const { t } = useLingui();
  const text = useVoiceText();
  const s = useStoreFields(callStore, ["status", "output", "deafen", "canListen", "serverDeafened", "screenshare", "canVideo"] as const);
  const connected = s.status === "connected";
  const deaf = deafenLabel({ serverDeafened: s.serverDeafened, canListen: s.canListen, deafened: s.deafen });
  const then = (fn: () => void) => () => {
    onClose();
    // the next sheet opens once this one has slid away
    setTimeout(fn, 280);
  };

  return (
    <Sheet visible={visible} onClose={onClose} testID="call-more-sheet">
      <SheetTitle>{t`More`}</SheetTitle>
      <RowGroup>
        <GroupRow first testID="call-more-output" icon={ROUTE_ICON[s.output]} label={t`Sound output`} value={text.route(s.output)} chevron onPress={then(onOutput)} />
        <GroupRow
          testID="call-more-deafen"
          icon={s.deafen ? "speaker-slash" : "headphones"}
          label={deaf === "serverDeafened" ? t`Server deafened` : deaf === "missing" ? t`Missing permission` : deaf === "undeafen" ? t`Undeafen` : t`Deafen`}
          selected={s.deafen}
          onPress={!s.canListen && !s.deafen ? undefined : () => void call.toggleDeafen()}
        />
        {Platform.OS === "android" && live ? (
          <GroupRow
            testID="call-more-screenshare"
            icon="monitor-arrow-up"
            label={!s.canVideo && !s.screenshare ? t`Screen share unavailable` : s.screenshare ? t`Stop sharing` : t`Share screen`}
            selected={s.screenshare}
            onPress={!connected || (!s.canVideo && !s.screenshare) ? undefined : then(() => void call.toggleScreenshare())}
          />
        ) : null}
        {onSoundboard ? <GroupRow testID="call-more-soundboard" icon="music-note" label={t`Soundboard`} chevron onPress={connected ? then(onSoundboard) : undefined} /> : null}
        {onRoomControls ? <GroupRow testID="call-more-room" icon="lock-simple" label={t`Room controls`} chevron onPress={then(onRoomControls)} /> : null}
      </RowGroup>
    </Sheet>
  );
}
