import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { editStage, endStage, inviteToSpeak, lowerHand, moveToAudience, raiseHand, type StageState } from "@zrzur/sdk/solid/voiceExtras";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { UserAvatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

import { call, callStore } from "../call";
import { stageRoles } from "../logic";
import { useStore } from "../store";
import { Note, PillButton } from "./parts";

const EMPTY: StageState = { speakers: [], hands: [] };

/**
 * A stage's controls above the call (web: features/voice/stage/StagePanel):
 * topic, speaker and listener counts, speakers, raised hands for
 * moderators, and Ask to speak / Put hand down / Back to listeners / Speak /
 * Close the stage.
 */
export function StagePanel({ channel }: { channel: Channel }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const me = useSelfId() ?? "";
  const stage = useStore(callStore, (s) => s.stage) ?? EMPTY;
  const facts = useFields(channel, (c) => ({ moderator: c.havePermission("MuteMembers"), inCall: [...c.voiceParticipants.keys()] }));
  const moderator = !!facts?.moderator;
  const roles = stageRoles(stage, facts?.inCall ?? [], me);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const keep = (state: StageState) => call.setStage(state);
  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const user = (id: string) => client.users.get(id);

  return (
    <View testID="stage-panel" accessibilityLabel={t`Stage`} style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, gap: 12, borderRadius: 16, backgroundColor: palette.field }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="waveform" size={20} color={palette.accentText} />
        {editing ? (
          <TextInput
            testID="stage-topic-field"
            value={topic}
            onChangeText={setTopic}
            maxLength={120}
            autoFocus
            accessibilityLabel={t`Topic`}
            placeholder={t`Topic`}
            placeholderTextColor={palette.muted}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              paddingHorizontal: 12,
              backgroundColor: palette.frame,
              color: palette.fg,
              fontSize: 16,
              fontFamily: fontFamily(i18n.locale),
              ...inputDirStyle(topic),
            }}
          />
        ) : (
          <AText autoDir testID="stage-topic" size={16} line={22} weight="semibold" color={stage.topic ? palette.fg : palette.muted} style={{ flex: 1 }} numberOfLines={2}>
            {stage.topic ?? t`No topic yet`}
          </AText>
        )}
        {moderator && !editing ? (
          <PillButton
            tone="text"
            label={t`Edit topic`}
            testID="stage-edit-topic"
            onPress={() => {
              setTopic(stage.topic ?? "");
              setEditing(true);
            }}
          />
        ) : null}
      </View>
      {editing ? (
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <PillButton tone="text" label={t`Cancel`} onPress={() => setEditing(false)} />
          <PillButton
            tone="primary"
            label={t`Save`}
            testID="stage-topic-save"
            disabled={busy}
            onPress={() =>
              void act(async () => {
                keep(await editStage(client, channel, topic.trim() || undefined));
                setEditing(false);
              })
            }
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 16 }}>
        <AText testID="stage-speaker-count" size={13} line={18} weight="semibold" color={palette.muted}>
          {t`Speakers: ${String(roles.speakers.length)}`}
        </AText>
        <AText testID="stage-audience-count" size={13} line={18} weight="semibold" color={palette.muted}>
          {t`Listening: ${String(roles.audience.length)}`}
        </AText>
      </View>

      {roles.speakers.length ? (
        <View accessibilityLabel={t`Speakers`} style={{ gap: 6 }}>
          {roles.speakers.map((id) => (
            <Person key={id} id={id} name={user(id)?.displayName ?? user(id)?.username ?? ""}>
              {moderator && id !== me ? (
                <PillButton tone="text" label={t`Back to listeners`} disabled={busy} testID={`stage-demote-${id}`} onPress={() => void act(async () => keep(await moveToAudience(client, channel, id)))} />
              ) : null}
            </Person>
          ))}
        </View>
      ) : null}

      {moderator && roles.hands.length ? (
        <View accessibilityLabel={t`Asking to speak`} style={{ gap: 6 }}>
          {roles.hands.map((id) => (
            <Person key={id} id={id} hand name={user(id)?.displayName ?? user(id)?.username ?? ""}>
              <PillButton tone="primary" label={t`Give the floor`} disabled={busy} testID={`stage-invite-${id}`} onPress={() => void act(async () => keep(await inviteToSpeak(client, channel, id)))} />
              <PillButton tone="text" label={t`Put hand down`} disabled={busy} testID={`stage-lower-${id}`} onPress={() => void act(async () => keep(await lowerHand(client, channel, id)))} />
            </Person>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {roles.mine === "audience" && !moderator ? (
          <PillButton tone="primary" icon="hand-waving" label={t`Ask to speak`} disabled={busy} testID="stage-raise-hand" onPress={() => void act(async () => keep(await raiseHand(client, channel)))} />
        ) : null}
        {roles.mine === "hand" ? <PillButton label={t`Put hand down`} disabled={busy} testID="stage-lower-hand" onPress={() => void act(async () => keep(await lowerHand(client, channel)))} /> : null}
        {roles.mine === "speaker" ? <PillButton label={t`Back to listeners`} disabled={busy} testID="stage-stop-speaking" onPress={() => void act(async () => keep(await moveToAudience(client, channel)))} /> : null}
        {moderator && roles.mine !== "speaker" ? (
          <PillButton icon="microphone" label={t`Speak`} disabled={busy} testID="stage-speak" onPress={() => void act(async () => keep(await inviteToSpeak(client, channel, "@me")))} />
        ) : null}
        {moderator && !confirmEnd ? <PillButton tone="text" label={t`Close the stage`} testID="stage-end" onPress={() => setConfirmEnd(true)} /> : null}
      </View>
      {moderator && confirmEnd ? (
        <View accessibilityLabel={t`Close the stage`} style={{ gap: 8 }}>
          <Note>{t`Everyone leaves the stage.`}</Note>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton
              tone="danger"
              label={t`Close the stage`}
              disabled={busy}
              testID="stage-end-confirm"
              onPress={() =>
                void act(async () => {
                  keep(await endStage(client, channel));
                  setConfirmEnd(false);
                })
              }
            />
            <PillButton tone="text" label={t`Cancel`} onPress={() => setConfirmEnd(false)} />
          </View>
        </View>
      ) : null}
      {error ? <Note alert>{error}</Note> : null}
    </View>
  );
}

function Person({ id, name, hand, children }: { id: string; name: string; hand?: boolean; children?: React.ReactNode }) {
  const { palette } = useTheme();
  const client = useClient();
  return (
    <View testID={hand ? `stage-hand-${id}` : `stage-speaker-${id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, flexWrap: "wrap" }}>
      {hand ? <Icon name="hand-waving" size={18} color={palette.accentText} /> : null}
      <UserAvatar user={client.users.get(id)} size={24} />
      <AText autoDir size={14} line={20} weight="medium" color={palette.fg} style={{ flex: 1, minWidth: 80 }} numberOfLines={1}>
        {name}
      </AText>
      {children}
    </View>
  );
}
