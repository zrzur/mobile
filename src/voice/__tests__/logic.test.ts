import {
  allowedVoiceUrl,
  callDuration,
  canRetryRejoin,
  canSpeak,
  captureOptions,
  controlsRoom,
  deafenLabel,
  defaultRoute,
  gridColumns,
  livekitHealthUrl,
  micLabel,
  microphoneOpen,
  moderationRights,
  occupancy,
  outputRoutes,
  playbackVolume,
  roomInfoOf,
  routeDevice,
  sameList,
  soundGain,
  soundUrl,
  SpeakingThrottle,
  stageRoles,
  stepLimit,
  tileOrder,
  userLimitChange,
  voiceErrorKind,
  voiceErrorType,
} from "../logic";

describe("voice errors", () => {
  it("reads the type like the web", () => {
    expect(voiceErrorType({ type: "CannotJoinCall" })).toBe("CannotJoinCall");
    expect(voiceErrorType(JSON.stringify({ type: "VoiceRejoinRefused" }))).toBe("VoiceRejoinRefused");
    expect(voiceErrorType("429 Too Many Requests")).toBe("RateLimited");
    expect(voiceErrorType("boom")).toBe("NetworkError");
    expect(voiceErrorType({ code: 429 })).toBe("RateLimited");
    expect(voiceErrorType({ retry_after: 3 })).toBe("RateLimited");
    expect(voiceErrorType({ response: { data: { type: "MissingPermission" } } })).toBe("MissingPermission");
    expect(voiceErrorType({ name: "NotAllowedError" })).toBe("NotAllowedError");
    expect(voiceErrorType(null)).toBe("NetworkError");
  });

  it("maps every type to a message kind", () => {
    expect(voiceErrorKind({ type: "VoiceUnavailable" })).toBe("unavailable");
    expect(voiceErrorKind({ type: "CannotJoinCall" })).toBe("full");
    expect(voiceErrorKind({ type: "UnknownChannel" })).toBe("gone");
    expect(voiceErrorKind({ type: "NotAVoiceChannel" })).toBe("gone");
    expect(voiceErrorKind({ type: "AlreadyConnected" })).toBe("elsewhere");
    expect(voiceErrorKind({ name: "NotFoundError" })).toBe("noDevice");
    expect(voiceErrorKind(new Error("x"))).toBe("failed");
  });

  it("does not retry a server refusal", () => {
    expect(canRetryRejoin({ type: "AlreadyConnected" })).toBe(false);
    expect(canRetryRejoin(JSON.stringify({ type: "VoiceRejoinRefused" }))).toBe(false);
    expect(canRetryRejoin(new TypeError("offline"))).toBe(true);
  });
});

describe("voice nodes", () => {
  it("probes ws nodes over http", () => {
    expect(livekitHealthUrl("wss://voice.example")).toBe("https://voice.example");
    expect(livekitHealthUrl("ws://10.0.2.2:7880")).toBe("http://10.0.2.2:7880");
    expect(livekitHealthUrl("https://x")).toBe("https://x");
  });

  it("allows plain ws only for a local dev server", () => {
    expect(allowedVoiceUrl("wss://voice.zrzur.com")).toBe(true);
    expect(allowedVoiceUrl("ws://voice.zrzur.com")).toBe(false);
    expect(allowedVoiceUrl("ws://localhost:7880", true)).toBe(true);
    expect(allowedVoiceUrl("ws://evil.example", true)).toBe(false);
  });
});

describe("rooms", () => {
  it("is full at the limit, never without one", () => {
    expect(occupancy(3, 3).full).toBe(true);
    expect(occupancy(2, 3).full).toBe(false);
    expect(occupancy(9, undefined).full).toBe(false);
    expect(occupancy(9, 0).full).toBe(false);
  });

  it("reads room fields from the raw channel", () => {
    expect(roomInfoOf({ voice: { maker: true, temporary_for: "u1", locked: true } })).toEqual({ maker: true, temporaryFor: "u1", locked: true, hidden: false });
    expect(roomInfoOf(null)).toEqual({ maker: false, temporaryFor: undefined, locked: false, hidden: false });
  });

  it("gives room controls to the owner or a permission manager", () => {
    const info = roomInfoOf({ voice: { temporary_for: "me" } });
    expect(controlsRoom(info, "me", false)).toBe(true);
    expect(controlsRoom(info, "other", false)).toBe(false);
    expect(controlsRoom(info, "other", true)).toBe(true);
    expect(controlsRoom(roomInfoOf({}), "me", true)).toBe(false);
  });

  it("steps the size like the web stepper", () => {
    expect(stepLimit(0, 1)).toBe(2);
    expect(stepLimit(2, 1)).toBe(3);
    expect(stepLimit(99, 1)).toBe(99);
    expect(stepLimit(1, -1)).toBe(0);
    expect(stepLimit(0, -1)).toBe(0);
    expect(userLimitChange(0)).toEqual({ max_users: 0 });
    expect(userLimitChange(5)).toEqual({ max_users: 5 });
  });
});

describe("moderation", () => {
  const base = { actorId: "a", targetId: "t", ownerId: "o", actorRank: 1, targetRank: 5, targetPresent: true, muteMembers: true, deafenMembers: false, moveMembers: true };
  it("needs a higher rank and the target in the call", () => {
    expect(moderationRights(base)).toEqual({ mute: true, deafen: false, move: true, any: true });
    expect(moderationRights({ ...base, actorRank: 9 }).any).toBe(false);
    expect(moderationRights({ ...base, targetPresent: false }).any).toBe(false);
    expect(moderationRights({ ...base, targetId: "a" }).any).toBe(false);
  });
  it("the owner can act on anyone, nobody on the owner", () => {
    expect(moderationRights({ ...base, actorId: "o", actorRank: 99 }).mute).toBe(true);
    expect(moderationRights({ ...base, targetId: "o" }).mute).toBe(false);
  });
});

describe("stage", () => {
  it("splits speakers, hands and audience", () => {
    const roles = stageRoles({ speakers: ["s", "gone"], hands: ["h", "s"] }, ["s", "h", "l"], "me");
    expect(roles.speakers).toEqual(["s"]);
    expect(roles.hands).toEqual(["h"]);
    expect(roles.audience.sort()).toEqual(["l", "me"]);
    expect(roles.mine).toBe("audience");
    expect(stageRoles({ speakers: ["me"], hands: [] }, [], "me").mine).toBe("speaker");
    expect(stageRoles({ speakers: [], hands: ["me"] }, [], "me").mine).toBe("hand");
  });
});

describe("controls", () => {
  it("labels the microphone", () => {
    expect(micLabel({ serverMuted: true, canSpeak: false, unmuted: false })).toBe("serverMuted");
    expect(micLabel({ serverMuted: false, canSpeak: false, unmuted: false })).toBe("missing");
    expect(micLabel({ serverMuted: false, canSpeak: true, unmuted: true })).toBe("mute");
    expect(micLabel({ serverMuted: false, canSpeak: true, unmuted: false })).toBe("unmute");
  });
  it("labels deafen", () => {
    expect(deafenLabel({ serverDeafened: true, canListen: false, deafened: false })).toBe("serverDeafened");
    expect(deafenLabel({ serverDeafened: false, canListen: false, deafened: false })).toBe("missing");
    expect(deafenLabel({ serverDeafened: false, canListen: true, deafened: true })).toBe("undeafen");
    expect(deafenLabel({ serverDeafened: false, canListen: true, deafened: false })).toBe("deafen");
  });
  it("opens the microphone only when chosen, heard and allowed", () => {
    expect(microphoneOpen({ micOn: true, deafen: false, canSpeak: true })).toBe(true);
    expect(microphoneOpen({ micOn: true, deafen: true, canSpeak: true })).toBe(false);
    expect(microphoneOpen({ micOn: true, deafen: false, canSpeak: false })).toBe(false);
    expect(microphoneOpen({ micOn: false, deafen: false, canSpeak: true })).toBe(false);
  });
  it("lets only stage speakers talk on a stage", () => {
    expect(canSpeak({ speakPermission: true, serverMuted: false, stage: false, stageSpeaker: false })).toBe(true);
    expect(canSpeak({ speakPermission: true, serverMuted: false, stage: true, stageSpeaker: false })).toBe(false);
    expect(canSpeak({ speakPermission: true, serverMuted: false, stage: true, stageSpeaker: true })).toBe(true);
    expect(canSpeak({ speakPermission: true, serverMuted: true, stage: false, stageSpeaker: false })).toBe(false);
    expect(canSpeak({ speakPermission: false, serverMuted: false, stage: false, stageSpeaker: false })).toBe(false);
  });
});

describe("audio", () => {
  it("maps the voice settings to capture options", () => {
    expect(captureOptions({ noiseSuppression: false, echoCancellation: true, autoGain: false })).toEqual({ noiseSuppression: false, echoCancellation: true, autoGainControl: false });
  });
  it("plays nothing while deafened and clamps the volume", () => {
    expect(playbackVolume(0.5, true)).toBe(0);
    expect(playbackVolume(0.5, false)).toBe(0.5);
    expect(playbackVolume(3, false)).toBe(1);
    expect(playbackVolume(Number.NaN, false)).toBe(1);
  });
  it("builds sound urls and gains like the web", () => {
    expect(soundUrl("https://cdn.example/", "s1")).toBe("https://cdn.example/sounds/s1/original");
    expect(soundGain(50, 0.5)).toBe(0.25);
    expect(soundGain(200, 2)).toBe(1);
    expect(soundGain(-5, 1)).toBe(0);
  });
  it("offers real Android routes and the iOS set", () => {
    expect(outputRoutes("android", ["earpiece", "speaker", "bluetooth"])).toEqual(["speaker", "earpiece", "bluetooth"]);
    expect(outputRoutes("android", [])).toEqual(["speaker"]);
    expect(outputRoutes("ios", ["default", "force_speaker"])).toEqual(["speaker", "earpiece", "bluetooth"]);
  });
  it("selects the platform's device ids", () => {
    expect(routeDevice("android", "headset")).toBe("headset");
    expect(routeDevice("ios", "speaker")).toBe("force_speaker");
    expect(routeDevice("ios", "earpiece")).toBe("default");
    expect(routeDevice("ios", "bluetooth")).toBe("picker");
    expect(defaultRoute(true)).toBe("earpiece");
    expect(defaultRoute(false)).toBe("speaker");
  });
});

describe("SpeakingThrottle", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("emits at most once per interval and only on change", () => {
    let now = 1000;
    const seen: string[][] = [];
    const throttle = new SpeakingThrottle((ids) => seen.push(ids), 250, () => now);
    throttle.push(["b", "a"]);
    expect(seen).toEqual([["a", "b"]]);
    throttle.push(["a", "b"]); // same set: nothing
    throttle.push(["a"]);
    throttle.push(["c"]);
    throttle.push(["a", "c"]);
    expect(seen).toHaveLength(1);
    now += 250;
    jest.advanceTimersByTime(250);
    expect(seen).toEqual([["a", "b"], ["a", "c"]]);
    // a burst that ends where it started emits nothing
    throttle.push(["x"]);
    throttle.push(["a", "c"]);
    now += 250;
    jest.advanceTimersByTime(250);
    expect(seen).toHaveLength(2);
    throttle.clear();
  });
});

describe("layout", () => {
  it("chooses columns by count and width", () => {
    expect(gridColumns(1, 375)).toBe(1);
    expect(gridColumns(2, 375)).toBe(2);
    expect(gridColumns(5, 375)).toBe(2);
    expect(gridColumns(5, 430)).toBe(3);
    expect(gridColumns(9, 800)).toBe(3);
    expect(gridColumns(12, 800)).toBe(4);
  });
  it("puts you first", () => {
    expect(tileOrder(["a", "me", "b"], "me")).toEqual(["me", "a", "b"]);
    expect(tileOrder(["a", "b"], "me")).toEqual(["a", "b"]);
  });
  it("formats the call time", () => {
    expect(callDuration(65_000)).toBe("01:05");
    expect(callDuration(3_725_000)).toBe("1:02:05");
    expect(callDuration(-5)).toBe("00:00");
  });
  it("compares lists", () => {
    expect(sameList(["a"], ["a"])).toBe(true);
    expect(sameList(["a"], ["b"])).toBe(false);
  });
});
