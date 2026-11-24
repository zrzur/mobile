import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { type ComponentProps, useRef, useState } from "react";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useNow } from "@/ui/events/useNow";

import { Composer, type ComposerAction, type ComposerTools } from "./Composer";
import { canCreatePoll, canRecordVoice, canSendGifs, GifPickerSheet, PollCreateSheet, VoiceRecordButton, VoiceRecorder } from "./rich";

type Props = Omit<ComponentProps<typeof Composer>, "actions" | "accessory" | "idleButton" | "onTools"> & { channel: Channel };

/**
 * The message box with the rich parts (web Composition on a phone): the GIF
 * picker, "Voice message" and "Create poll" as tiles of the "+" panel (in
 * the web's order), the recording bar above the box. Each shows only where the web shows it:
 * GIFs need uploads and embeds; polls need polls on, rich content, no
 * timeout, and Manage Messages in an announcement channel; voice needs
 * uploads. A voice note goes with the text in the box, as on the web.
 * With nothing typed or attached, the microphone takes Send's place: a tap
 * opens the recording bar, a hold records until the finger lifts and sends.
 */
export function RichComposer(props: Props) {
  const { t } = useLingui();
  const client = useClient();
  const now = useNow(60_000);
  const { channel } = props;
  const rules = useFields(channel, (c) => ({
    gifs: canSendGifs(c),
    voice: canRecordVoice(c),
    poll: canCreatePoll(c, client),
    announcementOnly: !!c.announcement && !c.havePermission("ManageMessages"),
    timeoutUntil: c.server?.member?.timeout?.getTime() ?? 0,
  }));
  const [gif, setGif] = useState(false);
  const [poll, setPoll] = useState(false);
  const [rec, setRec] = useState<{ held: boolean } | null>(null);
  // the composer's tools, for the recorder's Send (used in event handlers only)
  const tools = useRef<ComposerTools | null>(null);

  const editing = props.mode?.kind === "edit";
  const timedOut = !!rules && rules.timeoutUntil > now;
  const actions: ComposerAction[] = [];
  if (rules?.gifs && !editing) {
    actions.push({
      id: "gif",
      icon: "gif",
      label: t`GIF picker`,
      onPress: (tools) => {
        tools.closePanel();
        setGif(true);
      },
    });
  }
  if (rules?.voice && !editing) {
    actions.push({
      id: "voice",
      icon: "microphone",
      label: t`Voice message`,
      onPress: (tools) => {
        tools.closePanel();
        setRec({ held: false });
      },
    });
  }

  if (rules?.poll && !timedOut && !rules.announcementOnly && !editing) {
    actions.push({
      id: "poll",
      icon: "list-checks",
      label: t`Create poll`,
      onPress: (tools) => {
        tools.closePanel();
        setPoll(true);
      },
    });
  }
  return (
    <>
      <Composer
        {...props}
        actions={actions}
        idleButton={
          rules?.voice && !editing ? (
            <VoiceRecordButton
              // the bar is open from a tap: its own Send and Discard finish it
              disabled={!!rec && !rec.held}
              onStart={(how) => {
                tools.current?.closePanel();
                setRec({ held: how === "hold" });
              }}
              onRelease={() => setRec((now) => (now?.held ? { held: false } : now))}
            />
          ) : undefined
        }
        onTools={(next) => {
          tools.current = next;
        }}
        accessory={
          rec ? (
            <VoiceRecorder
              held={rec.held}
              onClose={() => setRec(null)}
              onSend={(file) => {
                setRec(null);
                tools.current?.sendFile({ uri: file.uri, name: file.name, type: file.type });
              }}
            />
          ) : null
        }
      />
      {rules?.gifs ? (
        <GifPickerSheet
          visible={gif}
          onClose={() => setGif(false)}
          onSend={(url) => {
            void tools.current?.sendNow(url);
          }}
        />
      ) : null}
      {poll ? <PollCreateSheet channel={channel} visible onClose={() => setPoll(false)} onPosted={props.onSent} /> : null}
    </>
  );
}
