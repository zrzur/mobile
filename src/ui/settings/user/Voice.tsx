import { useLingui } from "@lingui/react/macro";

import { useClient } from "@/client/ClientProvider";
import { RowGroup } from "@/ui/app/parts";

import { ControlRow, SettingsPage, SettingsSection, Toggle } from "../parts";
import { useDevicePrefs } from "./devicePrefs";
import { Slider, StackRow } from "./userParts";
import { VOICE_DEFAULTS, VOICE_KEY, type VoicePrefs } from "./userPrefs";

/**
 * Voice & Video (web: VoiceSettings), the parts that make sense on a phone,
 * kept on this device like the web `voice` store. Left out (spec §15):
 * device pickers, push to talk and its key, game keys, screen share options,
 * the live input meter (needs microphone access while the page is open).
 */
export function VoicePage() {
  const { t } = useLingui();
  const client = useClient();
  const [voice, setVoice, ready] = useDevicePrefs<VoicePrefs>(VOICE_KEY, VOICE_DEFAULTS);
  const video = !!client.configuration?.features?.limits?.default?.video;
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const processing = voice.highQuality;

  return (
    <SettingsPage title={video ? t`Voice & Video` : t`Voice`} testID="user-voice">
      <SettingsSection title={t`Volume`}>
        <RowGroup>
          <StackRow first icon="microphone" title={t`Input volume`}>
            <Slider label={t`Input volume`} value={voice.inputVolume} min={0} max={3} step={0.1} valueText={percent(voice.inputVolume)} disabled={!ready} onChange={(inputVolume) => setVoice({ inputVolume })} testID="voice-input-volume" />
          </StackRow>
          <StackRow icon="speaker-high" title={t`Output volume`}>
            <Slider label={t`Output volume`} value={voice.outputVolume} min={0} max={3} step={0.1} valueText={percent(voice.outputVolume)} disabled={!ready} onChange={(outputVolume) => setVoice({ outputVolume })} testID="voice-output-volume" />
          </StackRow>
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Input sensitivity`} description={t`Below the threshold, others hear silence.`}>
        <RowGroup>
          <ControlRow
            first
            title={t`Automatic`}
            description={t`Zrzur finds the right level for your room.`}
            control={<Toggle label={t`Automatic`} value={voice.autoSensitivity} disabled={!ready} onChange={(autoSensitivity) => setVoice({ autoSensitivity })} testID="voice-auto-sensitivity" />}
          />
          {voice.autoSensitivity ? null : (
            <StackRow title={t`Threshold`} description={t`Allow microphone access to see your level.`}>
              <Slider
                label={t`Input sensitivity threshold`}
                value={voice.threshold}
                min={-80}
                max={0}
                step={1}
                valueText={t`${voice.threshold} dB`}
                onChange={(threshold) => setVoice({ threshold })}
                testID="voice-threshold"
              />
            </StackRow>
          )}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Voice processing`}>
        <RowGroup>
          <ControlRow
            first
            title={t`High quality audio`}
            description={t`For music: 128 kbps stereo, with the processing below turned off.`}
            control={<Toggle label={t`High quality audio`} value={voice.highQuality} disabled={!ready} onChange={(highQuality) => setVoice({ highQuality })} testID="voice-high-quality" />}
          />
          <ControlRow
            title={t`Noise suppression`}
            description={t`Filters keyboard and fan noise on your device.`}
            control={<Toggle label={t`Noise suppression`} value={voice.noiseSuppression && !processing} disabled={!ready || processing} onChange={(noiseSuppression) => setVoice({ noiseSuppression })} testID="voice-noise" />}
          />
          <ControlRow
            title={t`Echo cancellation`}
            description={t`Stops others hearing themselves through your speaker.`}
            control={<Toggle label={t`Echo cancellation`} value={voice.echoCancellation && !processing} disabled={!ready || processing} onChange={(echoCancellation) => setVoice({ echoCancellation })} testID="voice-echo" />}
          />
          <ControlRow
            title={t`Automatic gain control`}
            description={t`Keeps your microphone at a steady level.`}
            control={<Toggle label={t`Automatic gain control`} value={voice.autoGain && !processing} disabled={!ready || processing} onChange={(autoGain) => setVoice({ autoGain })} testID="voice-gain" />}
          />
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Soundboard`} description={t`Short sounds people play in a voice call, on your device.`}>
        <RowGroup>
          <ControlRow
            first
            title={t`Mute the soundboard`}
            description={t`You hear no soundboard sounds in calls.`}
            control={<Toggle label={t`Mute the soundboard`} value={voice.soundboardMuted} disabled={!ready} onChange={(soundboardMuted) => setVoice({ soundboardMuted })} testID="voice-soundboard-mute" />}
          />
          <StackRow title={t`Soundboard volume`}>
            <Slider
              label={t`Soundboard volume`}
              value={voice.soundboardVolume}
              min={0}
              max={1}
              step={0.05}
              valueText={percent(voice.soundboardVolume)}
              disabled={!ready || voice.soundboardMuted}
              onChange={(soundboardVolume) => setVoice({ soundboardVolume })}
              testID="voice-soundboard-volume"
            />
          </StackRow>
        </RowGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
