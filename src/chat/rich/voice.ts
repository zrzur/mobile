/**
 * Voice messages are ordinary audio attachments whose file name starts with
 * "voice-message" (web `messaging/elements/voice.ts`). The name only changes
 * how the file is shown; the upload is like any other file.
 */
export const VOICE_PREFIX = "voice-message";
export const WAVEFORM_BARS = 40;
/** Longest recording, in seconds */
export const MAX_VOICE_SECONDS = 300;
/** Shorter recordings are dropped instead of sent */
export const MIN_VOICE_SECONDS = 0.5;

export function isVoiceMessageName(name: string | undefined) {
  return !!name && /^voice-message-\d+\.(ogg|webm|m4a|mp4)$/i.test(name);
}

/**
 * Recordings this app sent before it named them like the web: expo-audio's
 * own name, `recording-<UUID>.m4a`. Shown as voice notes too, so those
 * messages look right on the phone (the web shows them as audio files).
 */
export function isEarlyPhoneRecordingName(name: string | undefined) {
  return !!name && /^recording-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp4|aac)$/i.test(name);
}

/** The parts of an SDK file these rules read */
export type FileLike = { filename?: string; contentType?: string; metadata?: { type?: string } | null };

/** A file the web shows as a voice note (the media server may label recorded audio as a plain file) */
export function isVoiceAttachment(file: FileLike): boolean {
  const type = file.metadata?.type;
  return (isVoiceMessageName(file.filename) || isEarlyPhoneRecordingName(file.filename)) && (type === "Audio" || type === "Video" || type === "File");
}

/** A song or other audio file: the voice note's look with its name and a download button */
export function isAudioTrack(file: FileLike): boolean {
  return !isVoiceAttachment(file) && file.metadata?.type === "Audio";
}

/** Files drawn by the voice player (the chat list leaves them out of its own attachments) */
export const isAudioAttachment = (file: FileLike) => isVoiceAttachment(file) || isAudioTrack(file);

/** The name a new recording is sent with: `voice-message-<ms>.m4a` */
export function voiceFileName(now = Date.now(), extension = "m4a") {
  return `${VOICE_PREFIX}-${now}.${extension.replace(/^\./, "")}`;
}

/** The last part of a file address, without a query */
export function fileNameOf(uri: string): string {
  const path = uri.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The name a recording is uploaded under. The phone's uploader sends the
 * file's own name on disk, so the file itself must carry the voice name:
 * `null` when it already does, otherwise the name to rename it to.
 */
export function voiceRenameTo(uri: string, now = Date.now()): string | null {
  const name = fileNameOf(uri);
  if (isVoiceMessageName(name)) return null;
  // only the extensions the web takes as a voice note; the recorder writes AAC in MP4
  const extension = /\.(ogg|webm|m4a|mp4)$/i.exec(name)?.[1].toLowerCase() ?? "m4a";
  return voiceFileName(now, extension);
}

/** Query that asks the media server for the AAC copy of a voice message (web AAC_COPY) */
export const AAC_COPY = "format=m4a";

/** Opus in Ogg or WebM: the web's Chrome and Firefox recordings */
export function isOpusContainer(contentType?: string, name?: string) {
  const type = (contentType ?? "").toLowerCase();
  const extension = name?.split(".").pop()?.toLowerCase();
  return type.includes("ogg") || type.includes("webm") || type === "audio/opus" || extension === "ogg" || extension === "webm";
}

/**
 * The address a voice note plays from (web playableVoiceSrc). iPhones can't
 * play Opus in Ogg or WebM, so they get the AAC copy the media server makes
 * of every voice message; Android plays the recording itself.
 */
export function playableVoiceSrc(src: string, file: { contentType?: string; name?: string }, os: string) {
  if (os !== "ios" || !isOpusContainer(file.contentType, file.name)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}${AAC_COPY}`;
}

/** Web `mediaTime`: m:ss */
export function mediaTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Shrink samples to `count` bars between 0 and 1 (loudest bar = 1) */
export function toBars(samples: ArrayLike<number>, count = WAVEFORM_BARS) {
  const bars: number[] = [];
  const size = Math.max(1, Math.floor(samples.length / count));
  for (let bar = 0; bar < count; bar++) {
    let sum = 0;
    const start = bar * size;
    const end = Math.min(samples.length, start + size);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    bars.push(end > start ? Math.sqrt(sum / (end - start)) : 0);
  }
  const max = Math.max(...bars, 1e-6);
  return bars.map((value) => Math.max(0.08, value / max));
}

/** Stand-in bars when the audio is not read: stable for the same file */
export function placeholderBars(seed: string, count = WAVEFORM_BARS) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Array.from({ length: count }, (_, i) => {
    hash = Math.imul(hash ^ (i + 1), 2654435761);
    return 0.2 + ((hash >>> 0) % 1000) / 1250;
  });
}

/**
 * The recorder's level in dBFS (about -160 silent to 0 loudest) as a bar
 * height, 0.08 to 1, close to the web's RMS × 4 meter
 */
export function meteringToLevel(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0.08;
  const rms = Math.pow(10, Math.max(-160, Math.min(0, db)) / 20);
  return Math.min(1, Math.max(0.08, rms * 4));
}

/** The newest level on the end, the oldest dropped */
export function pushLevel(levels: readonly number[], level: number): number[] {
  return [...levels.slice(1), level];
}

/** Which bar is drawn as played */
export const barPlayed = (index: number, count: number, progress: number) => (index + 0.5) / count <= progress;

/** Seek ratio from a touch on the wave (mirrored in right-to-left) */
export function seekRatio(x: number, width: number, rtl: boolean) {
  if (width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return rtl ? 1 - ratio : ratio;
}
