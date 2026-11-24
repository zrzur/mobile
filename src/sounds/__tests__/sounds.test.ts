const mockPlayers: { loop: boolean; volume: number; play: jest.Mock; pause: jest.Mock; remove: jest.Mock; addListener: jest.Mock }[] = [];
const mockSetAudioMode = jest.fn(async () => undefined);
jest.mock("expo-audio", () => ({
  setAudioModeAsync: (...args: unknown[]) => (mockSetAudioMode as (...a: unknown[]) => Promise<void>)(...args),
  createAudioPlayer: jest.fn(() => {
    const player = { loop: false, volume: 1, play: jest.fn(), pause: jest.fn(), remove: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) };
    mockPlayers.push(player);
    return player;
  }),
}));
const mockStored: { value: string | null } = { value: null };
jest.mock("@/lib/secureStorage", () => ({
  secureStorage: { get: jest.fn(async () => mockStored.value), set: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) },
}));
const mockBusy = { value: false };
jest.mock("@/media/playback", () => ({ playback: { busy: () => mockBusy.value } }));
jest.mock("../assets/mute.wav", () => 1, { virtual: true });
jest.mock("../assets/user_join_voice.wav", () => 2, { virtual: true });
jest.mock("../assets/ringtone_incoming.wav", () => 3, { virtual: true });

// eslint-disable-next-line import/first
import { soundAllowed, soundPlan } from "../logic";
// eslint-disable-next-line import/first
import { loopSound, playSound, previewSound, soundPrefsChanged } from "../player";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockPlayers.length = 0;
  mockSetAudioMode.mockClear();
  mockStored.value = null;
  mockBusy.value = false;
  soundPrefsChanged();
});

describe("which sound plays", () => {
  it("follows the switches in Notifications > Sounds", () => {
    expect(soundAllowed("mute", {})).toBe(true);
    expect(soundAllowed("mute", { mute: false })).toBe(false);
    expect(soundAllowed("userJoinVoice", { userJoinVoice: false })).toBe(false);
    // ringtones have no switch
    expect(soundAllowed("ringtoneIncoming", { mute: false })).toBe(true);
  });
  it("leaves the call's audio session alone and skips over a playing note", () => {
    expect(soundPlan({ inCall: true, mediaPlaying: true })).toBe("as-is");
    expect(soundPlan({ inCall: false, mediaPlaying: true })).toBe("skip");
    expect(soundPlan({ inCall: false, mediaPlaying: false })).toBe("ambient");
  });
});

describe("player", () => {
  it("plays a cue once, quiet on the silent switch outside a call", async () => {
    playSound("mute");
    await flush();
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0].play).toHaveBeenCalled();
    expect(mockPlayers[0].loop).toBe(false);
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }));
  });
  it("does not touch the audio mode during a call", async () => {
    playSound("userJoinVoice", true);
    await flush();
    expect(mockPlayers).toHaveLength(1);
    expect(mockSetAudioMode).not.toHaveBeenCalled();
  });
  it("plays nothing when the sound is switched off", async () => {
    mockStored.value = JSON.stringify({ mute: false });
    playSound("mute");
    await flush();
    expect(mockPlayers).toHaveLength(0);
  });
  it("skips a cue while a voice note or video plays", async () => {
    mockBusy.value = true;
    playSound("mute");
    await flush();
    expect(mockPlayers).toHaveLength(0);
  });
  it("previews a sound from settings even when it is switched off", async () => {
    mockStored.value = JSON.stringify({ mute: false });
    const done = previewSound("mute");
    await flush();
    expect(mockPlayers).toHaveLength(1);
    // the player reports the end
    const listener = (mockPlayers[0].addListener.mock.calls[0] as unknown as [string, (s: { didJustFinish: boolean }) => void])[1];
    listener({ didJustFinish: true });
    await expect(done).resolves.toBe(true);
    expect(mockPlayers[0].remove).toHaveBeenCalled();
  });
  it("loops a ringtone until stopped", async () => {
    const stop = loopSound("ringtoneIncoming");
    await flush();
    expect(mockPlayers[0].loop).toBe(true);
    stop();
    expect(mockPlayers[0].pause).toHaveBeenCalled();
    expect(mockPlayers[0].remove).toHaveBeenCalled();
  });
  it("a ringtone stopped before it started never plays on", async () => {
    const stop = loopSound("ringtoneIncoming");
    stop();
    await flush();
    expect(mockPlayers[0].remove).toHaveBeenCalled();
  });
});
