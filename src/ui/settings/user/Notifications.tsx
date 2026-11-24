import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { PushSettingsSection } from "@/notifications/PushSettings";
import { previewSound, soundPrefsChanged } from "@/sounds";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { PressScale } from "@/ui/kit/Press";

import { ControlRow, InlineError, SettingsPage, SettingsSection, Toggle } from "../parts";
import { useDevicePrefs } from "./devicePrefs";
import { EVENT_KEYS, type EventKey, type EventNotices, SOUNDS_KEY, SOUND_DEFAULTS, type SoundPrefs, eventNoticesValue, parseEventNotices, syncedValue } from "./userPrefs";

/** Revision stamp for a synced setting (called from event handlers only) */
function revision() {
  return Date.now();
}

/**
 * Events: four switches saved as the account setting `event_notices`
 * (synced, optimistic, reverted on failure). Only where the server has events.
 */
function EventsSection() {
  const { t } = useLingui();
  const client = useClient();
  const [state, setState] = useState<EventNotices>(() => parseEventNotices(undefined));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    client.api
      .post("/sync/settings/fetch" as never, { keys: ["event_notices"] } as never)
      .then((answer) => {
        if (!live) return;
        setState(parseEventNotices(syncedValue(answer, "event_notices")));
        setReady(true);
      })
      .catch((err) => {
        if (!live) return;
        setError(describeError(err));
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [client]);

  const change = async (key: EventKey, on: boolean) => {
    const before = state;
    const next = { ...state, [key]: on };
    setState(next);
    setError(undefined);
    try {
      await (client.api.post as (path: string, body: unknown, options: unknown) => Promise<unknown>)("/sync/settings/set", { event_notices: eventNoticesValue(next) }, { query: { timestamp: revision() } });
    } catch (err) {
      setState(before);
      setError(describeError(err));
    }
  };

  const rows: Record<EventKey, { icon: IconName; title: string; description: string }> = {
    reminders: { icon: "bell", title: t`Reminders before an event`, description: t`For events you are going to, or maybe going to.` },
    changes: { icon: "calendar", title: t`Changed or called off`, description: t`When the time or place of an event you answered changes.` },
    invitations: { icon: "users", title: t`Invitations to events`, description: t`When an organiser invites you to an event.` },
    seats: { icon: "check", title: t`A seat came free for you`, description: t`When you move up from the waiting list.` },
  };

  return (
    <SettingsSection title={t({ message: "Events", context: "notification settings" })}>
      <RowGroup>
        {EVENT_KEYS.map((key, i) => (
          <ControlRow
            key={key}
            first={i === 0}
            icon={rows[key].icon}
            title={rows[key].title}
            description={rows[key].description}
            control={<Toggle label={rows[key].title} value={state[key]} disabled={!ready} onChange={(on) => void change(key, on)} testID={`event-notice-${key}`} />}
          />
        ))}
      </RowGroup>
      <InlineError message={error} />
    </SettingsSection>
  );
}

/**
 * Notifications (web: Notifications + Sounds). Alerts: the phone's own push
 * notifications (the server pushes to Apple and Firebase devices, endpoints
 * `apn` and `fcm`, as well as Web Push). Sound switches are kept on this
 * device.
 */
export function NotificationsPage() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [sounds, setSounds] = useDevicePrefs<SoundPrefs>(SOUNDS_KEY, SOUND_DEFAULTS);
  const events = client.configuration?.features?.server_events === true;

  const [playing, setPlaying] = useState<keyof SoundPrefs>();
  const [failed, setFailed] = useState<keyof SoundPrefs>();
  const preview = (key: Exclude<keyof SoundPrefs, "message">) => {
    setPlaying(key);
    setFailed(undefined);
    void previewSound(key).then((ok) => {
      setPlaying((now) => (now === key ? undefined : now));
      if (!ok) setFailed(key);
    });
  };

  const soundRow = (key: keyof SoundPrefs, title: string, first: boolean, icon?: IconName) => (
    <ControlRow
      key={key}
      first={first}
      icon={icon}
      title={title}
      description={failed === key ? t`This sound couldn't be played. Check your output device.` : undefined}
      control={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {/* the message sound has no file of Zrzur's own yet: nothing to preview */}
          {key === "message" ? null : (
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t`Preview: ${String(title)}`}
              accessibilityState={{ selected: playing === key }}
              onPress={() => preview(key)}
              scale={0.94}
              testID={`sound-preview-${key}`}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
            >
              <Icon name={playing === key ? "speaker-high" : "play"} size={16} color={palette.iconNeutral} />
            </PressScale>
          )}
          <Toggle
            label={title}
            value={sounds[key]}
            onChange={(on) => {
              setSounds({ [key]: on });
              soundPrefsChanged();
            }}
            testID={`sound-${key}`}
          />
        </View>
      }
    />
  );

  return (
    <SettingsPage title={t`Notifications`} testID="user-notifications">
      <PushSettingsSection />
      {events ? <EventsSection /> : null}
      <SettingsSection title={t`Message sounds`}>
        <RowGroup>{soundRow("message", t`Message received`, true, "chat-circle-dots")}</RowGroup>
      </SettingsSection>
      <SettingsSection title={t`Voice and call sounds`}>
        <RowGroup>
          {soundRow("mute", t`Mute`, true, "microphone-slash")}
          {soundRow("unmute", t`Unmute`, false, "microphone")}
          {soundRow("deafen", t`Deafen`, false, "headphones-slash")}
          {soundRow("undeafen", t`Undeafen`, false, "headphones")}
          {soundRow("userJoinVoice", t`User joined call`, false, "user-plus")}
          {soundRow("userLeaveVoice", t`User left call`, false, "user-minus")}
        </RowGroup>
      </SettingsSection>
      <SettingsSection title={t`Stream sounds`}>
        <RowGroup>
          {soundRow("streamStart", t`Stream started`, true, "screencast")}
          {soundRow("streamEnd", t`Stream ended`, false, "stop")}
        </RowGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
