import { toSheetFile } from "../sheetFiles";
import {
  barPlayed,
  fileNameOf,
  isEarlyPhoneRecordingName,
  isOpusContainer,
  playableVoiceSrc,
  voiceRenameTo,
  isAudioAttachment,
  isAudioTrack,
  isVoiceAttachment,
  isVoiceMessageName,
  mediaTime,
  meteringToLevel,
  placeholderBars,
  pushLevel,
  seekRatio,
  toBars,
  voiceFileName,
} from "../voice";

describe("voice files", () => {
  it("knows voice notes by their name", () => {
    expect(isVoiceMessageName("voice-message-1700000000000.m4a")).toBe(true);
    expect(isVoiceMessageName("voice-message-1.ogg")).toBe(true);
    expect(isVoiceMessageName("voice-message.m4a")).toBe(false);
    expect(isVoiceMessageName("song.mp3")).toBe(false);
    expect(voiceFileName(42)).toBe("voice-message-42.m4a");
    expect(isVoiceMessageName(voiceFileName())).toBe(true);
  });
  it("tells voice notes from songs", () => {
    expect(isVoiceAttachment({ filename: "voice-message-1.webm", metadata: { type: "File" } })).toBe(true);
    expect(isVoiceAttachment({ filename: "voice-message-1.webm", metadata: { type: "Image" } })).toBe(false);
    expect(isAudioTrack({ filename: "song.mp3", metadata: { type: "Audio" } })).toBe(true);
    expect(isAudioTrack({ filename: "voice-message-1.m4a", metadata: { type: "Audio" } })).toBe(false);
    expect(isAudioAttachment({ filename: "a.pdf", metadata: { type: "File" } })).toBe(false);
  });
});

describe("waveform", () => {
  it("writes time as m:ss", () => {
    expect(mediaTime(0)).toBe("0:00");
    expect(mediaTime(65.9)).toBe("1:05");
    expect(mediaTime(NaN)).toBe("0:00");
  });
  it("makes bars between 0.08 and 1", () => {
    expect(toBars([0, 0, 1, 1], 2)).toEqual([0.08, 1]);
    const stand = placeholderBars("https://cdn/x");
    expect(stand).toHaveLength(40);
    expect(placeholderBars("https://cdn/x")).toEqual(stand);
    expect(stand.every((b) => b >= 0.2 && b <= 1)).toBe(true);
  });
  it("turns the recorder's dB into a bar and keeps the newest last", () => {
    expect(meteringToLevel(undefined)).toBe(0.08);
    expect(meteringToLevel(-160)).toBe(0.08);
    expect(meteringToLevel(0)).toBe(1);
    expect(meteringToLevel(-20)).toBeCloseTo(0.4);
    expect(pushLevel([1, 2, 3], 4)).toEqual([2, 3, 4]);
  });
  it("marks played bars and seeks mirrored in right-to-left", () => {
    expect(barPlayed(0, 4, 0.2)).toBe(true);
    expect(barPlayed(1, 4, 0.2)).toBe(false);
    expect(seekRatio(25, 100, false)).toBe(0.25);
    expect(seekRatio(25, 100, true)).toBe(0.75);
    expect(seekRatio(500, 100, false)).toBe(1);
    expect(seekRatio(5, 0, false)).toBe(0);
  });
});

describe("voice notes everywhere", () => {
  const early = "recording-5C28A1B2-0D3E-4F56-8A9B-0C1D2E3F4A5B.m4a";
  it("knows the phone's early recordings as voice notes", () => {
    expect(isEarlyPhoneRecordingName(early)).toBe(true);
    expect(isEarlyPhoneRecordingName("recording-1.m4a")).toBe(false);
    expect(isEarlyPhoneRecordingName("recording-5C28A1B2-0D3E-4F56-8A9B-0C1D2E3F4A5B.exe")).toBe(false);
    expect(isEarlyPhoneRecordingName(undefined)).toBe(false);
    expect(isVoiceAttachment({ filename: early, metadata: { type: "Audio" } })).toBe(true);
    // a voice note is never an audio track: no name, size or download button
    expect(isAudioTrack({ filename: early, metadata: { type: "Audio" } })).toBe(false);
    expect(isAudioAttachment({ filename: early, metadata: { type: "Audio" } })).toBe(true);
  });
  it("is audio in the message sheet whatever the server called it", () => {
    expect(toSheetFile({ id: "a", filename: "voice-message-1.webm", metadata: { type: "Video" }, originalUrl: "https://cdn/a" })?.kind).toBe("audio");
    expect(toSheetFile({ id: "b", filename: "clip.webm", metadata: { type: "Video" }, originalUrl: "https://cdn/b" })?.kind).toBe("video");
    expect(toSheetFile({ id: "c", filename: "song.mp3", metadata: { type: "Audio" }, originalUrl: "https://cdn/c" })?.kind).toBe("audio");
  });
});

describe("uploading a recording", () => {
  it("reads the file name from an address", () => {
    expect(fileNameOf("file:///var/mobile/Caches/ExpoAudio/voice-message-5.m4a")).toBe("voice-message-5.m4a");
    expect(fileNameOf("file:///a/b%20c.m4a?x=1")).toBe("b c.m4a");
  });
  it("renames only recordings without the voice name", () => {
    expect(voiceRenameTo("file:///c/ExpoAudio/voice-message-5.m4a")).toBeNull();
    expect(voiceRenameTo(`file:///c/ExpoAudio/${"recording-5C28A1B2-0D3E-4F56-8A9B-0C1D2E3F4A5B.m4a"}`, 7)).toBe("voice-message-7.m4a");
    expect(voiceRenameTo("file:///c/Audio/recording-x.aac", 7)).toBe("voice-message-7.m4a");
    expect(isVoiceMessageName(voiceRenameTo("file:///c/x.M4A", 9) ?? "")).toBe(true);
  });
});

describe("playing a voice note on a phone", () => {
  const url = "https://cdn.test/attachments/A/original";
  it("knows Opus recordings by type or name", () => {
    expect(isOpusContainer("audio/ogg")).toBe(true);
    expect(isOpusContainer("audio/opus")).toBe(true);
    expect(isOpusContainer("video/webm")).toBe(true);
    expect(isOpusContainer(undefined, "voice-message-1.webm")).toBe(true);
    expect(isOpusContainer("audio/mp4", "voice-message-1.m4a")).toBe(false);
  });
  it("gives iPhones the AAC copy of Ogg and WebM recordings", () => {
    expect(playableVoiceSrc(url, { contentType: "audio/ogg" }, "ios")).toBe(`${url}?format=m4a`);
    expect(playableVoiceSrc(`${url}?x=1`, { name: "voice-message-1.webm" }, "ios")).toBe(`${url}?x=1&format=m4a`);
    expect(playableVoiceSrc(url, { contentType: "audio/mp4" }, "ios")).toBe(url);
    expect(playableVoiceSrc(url, { contentType: "audio/ogg" }, "android")).toBe(url);
  });
});
