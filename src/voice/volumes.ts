/**
 * Per-person and per-stream volume, kept on this device (web: state.voice
 * userVolumes / userMuted / screenShareVolumes). Pure, so it is unit tested.
 */

export const VOLUMES_KEY = "zrzur.prefs.voiceVolumes";

export type PersonVolumes = {
  /** 0 to 3 (300 %), missing means 1 */
  users: Record<string, number>;
  /** Muted for me */
  muted: Record<string, boolean>;
  /** A person's stream sound, 0 to 3 */
  streams: Record<string, number>;
};

export const NO_VOLUMES: PersonVolumes = { users: {}, muted: {}, streams: {} };

/** 0 to 300 %; anything else is 100 % (web: clampVolume) */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(3, Math.max(0, volume));
}

/** Read the stored value, keeping only well-formed entries */
export function readVolumes(raw: string | null | undefined): PersonVolumes {
  const out: PersonVolumes = { users: {}, muted: {}, streams: {} };
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;
  const source = parsed as Record<string, unknown>;
  const numbers = (value: unknown, into: Record<string, number>) => {
    if (!value || typeof value !== "object") return;
    for (const [id, v] of Object.entries(value)) if (typeof v === "number" && Number.isFinite(v)) into[id] = clampVolume(v);
  };
  numbers(source.users, out.users);
  numbers(source.streams, out.streams);
  if (source.muted && typeof source.muted === "object")
    for (const [id, v] of Object.entries(source.muted)) if (v === true) out.muted[id] = true;
  return out;
}

/** The volume a voice plays at: the call's output volume times the person's own */
export function personVolume(options: { outputVolume: number; person?: number; muted?: boolean; deafened: boolean }): number {
  if (options.deafened || options.muted) return 0;
  const output = Math.min(1, Math.max(0, Number.isFinite(options.outputVolume) ? options.outputVolume : 1));
  return Math.round(output * clampVolume(options.person ?? 1) * 100) / 100;
}

/** "150%" (web: the volume slider's output) */
export function volumePercent(volume: number): string {
  return `${Math.round(clampVolume(volume) * 100)}%`;
}
