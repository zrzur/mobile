import { addTag, featuresBody, featuresFrom, isVanityName, listingBody, listingDirty, normaliseTag, splitTagInput, statusKind, statusReason, systemMessagesPatch, toggleStat, vanityName, vanityState } from "../discovery";
import { barAt, barHeights, hoursMinutes, isEmptyRange, perDay, shares, signed } from "../insights";
import { applySoundEvent, isFull, isSingleEmoji, isSoundFile, nameFromFile, seconds, soundProblem, soundsLeft } from "../soundboard";
import { kbps, megabytes, streamQuality, vanityLevel, wingsProgress } from "../wings";

describe("insights", () => {
  it("scales bars to the tallest day, with stubs for hidden counts", () => {
    expect(barHeights([0, 5, 10, null])).toEqual([0, 50, 100, 6]);
    expect(barHeights([1, 100])).toEqual([4, 100]);
    expect(barHeights([0, 0, undefined])).toEqual([0, 0, 0]);
    expect(barHeights([null, null])).toEqual([6, 6]);
  });

  it("starts the member scale at the smallest day", () => {
    expect(barHeights([10, 15, 20], true)).toEqual([20, 60, 100]);
    expect(barHeights([7, 7], true)).toEqual([60, 60]);
  });

  it("shares a sum, with a sliver for hidden parts", () => {
    expect(shares([1, 1, 2, null])).toEqual([25, 25, 50, 3]);
    expect(shares([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(shares([null, 0, undefined, 0])).toEqual([3, 0, 0, 0]);
  });

  it("counts an empty range, and a hidden count as activity", () => {
    expect(isEmptyRange([{ joins: 0, messages: 0 }, {}])).toBe(true);
    expect(isEmptyRange([{ joins: 0, messages: null }])).toBe(false);
    expect(isEmptyRange([{ voice_minutes: 3 }])).toBe(false);
  });

  it("formats signs, averages and voice time", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-2)).toBe("-2");
    expect(signed(0)).toBe("0");
    expect(perDay(100, 30)).toBe(3);
    expect(perDay(null, 30)).toBeNull();
    expect(perDay(5, 0)).toBe(0);
    expect(hoursMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(hoursMinutes(59)).toEqual({ hours: 0, minutes: 59 });
  });

  it("finds the touched bar with the oldest day at the start side", () => {
    expect(barAt(0, 300, 30, false)).toBe(0);
    expect(barAt(299, 300, 30, false)).toBe(29);
    expect(barAt(0, 300, 30, true)).toBe(29);
    expect(barAt(299, 300, 30, true)).toBe(0);
    expect(barAt(10, 0, 30, false)).toBe(-1);
  });
});

describe("soundboard", () => {
  it("takes MP3, OGG and WAV by type or extension", () => {
    expect(isSoundFile("audio/mpeg", "a")).toBe(true);
    expect(isSoundFile("audio/x-wav", null)).toBe(true);
    expect(isSoundFile("", "boom.OGG")).toBe(true);
    expect(isSoundFile("audio/flac", "boom.flac")).toBe(false);
  });

  it("names a sound after its file", () => {
    expect(nameFromFile("air_horn-loud.mp3")).toBe("air horn loud");
    expect(nameFromFile(`${"x".repeat(40)}.wav`)).toHaveLength(32);
  });

  it("checks type, then size, then length", () => {
    expect(soundProblem({ type: "image/png", name: "a.png", size: 1 }, 1000)).toBe("type");
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 2000 }, 1000)).toBe("size");
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 10 }, 1000)).toBeUndefined();
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 10 }, 1000, 5201)).toBe("length");
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 10 }, 1000, 5200)).toBeUndefined();
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 10 }, 1000, null)).toBe("unreadable");
    expect(soundProblem({ type: "audio/mpeg", name: "a.mp3", size: 10 }, 1000, 0)).toBe("unreadable");
  });

  it("accepts nothing or one emoji", () => {
    expect(isSingleEmoji("")).toBe(true);
    expect(isSingleEmoji("🎉")).toBe(true);
    expect(isSingleEmoji("👍🏽")).toBe(true);
    expect(isSingleEmoji("❤️")).toBe(true);
    expect(isSingleEmoji("👨‍👩‍👧")).toBe(true);
    expect(isSingleEmoji("🎉🎉")).toBe(false);
    expect(isSingleEmoji("ab")).toBe(false);
  });

  it("counts what is left and when it is full", () => {
    expect(soundsLeft(8, 3)).toBe(5);
    expect(soundsLeft(8, 10)).toBe(0);
    expect(soundsLeft(undefined, 3)).toBeUndefined();
    expect(isFull(8, 8)).toBe(true);
    expect(isFull(undefined, 99)).toBe(false);
    expect(seconds(2400, "en")).toBe("2.4");
    expect(seconds(2400, "de")).toBe("2,4");
  });

  it("keeps the list current from realtime events of this server only", () => {
    const a = { _id: "a", server: "s", name: "A" };
    const list = [a];
    expect(applySoundEvent(list, { type: "SoundboardSoundCreate", _id: "b", server: "s", name: "B" } as never, "s").map((x) => x._id)).toEqual(["a", "b"]);
    expect(applySoundEvent(list, { type: "SoundboardSoundCreate", _id: "b", server: "other" } as never, "s")).toBe(list);
    expect(applySoundEvent(list, { type: "SoundboardSoundUpdate", _id: "a", server: "s", name: "A2" } as never, "s")[0].name).toBe("A2");
    expect(applySoundEvent(list, { type: "SoundboardSoundDelete", id: "a", server: "s" }, "s")).toEqual([]);
    expect(applySoundEvent(list, { type: "SoundboardPlay" }, "s")).toBe(list);
  });
});

describe("discovery", () => {
  it("reads every request status", () => {
    expect(statusKind(undefined)).toBe("none");
    expect(statusKind("Pending")).toBe("pending");
    expect(statusKind("UnderReview")).toBe("review");
    expect(statusKind({ Approved: null })).toBe("approved");
    expect(statusKind({ Denied: "spam" })).toBe("denied");
    expect(statusKind({ Removed: null })).toBe("removed");
    expect(statusReason({ Denied: "spam" })).toBe("spam");
    expect(statusReason({ Approved: null })).toBeUndefined();
    expect(statusReason("Pending")).toBeUndefined();
  });

  it("normalises and validates tags", () => {
    expect(normaliseTag("  #Games ")).toBe("games");
    expect(addTag([], "#Games").tags).toEqual(["games"]);
    expect(addTag(["games"], "GAMES").tags).toEqual(["games"]);
    expect(addTag(["a1", "b1", "c1", "d1", "e1"], "f1").tags).toHaveLength(5);
    expect(addTag([], "x")).toEqual({ tags: [], invalid: true });
    expect(addTag([], "no spaces!")).toEqual({ tags: [], invalid: true });
    expect(addTag([], "ألعاب").tags).toEqual(["ألعاب"]);
    expect(addTag([], "").tags).toEqual([]);
    expect(splitTagInput("rpg,")).toEqual({ done: "rpg", rest: "" });
    expect(splitTagInput("rpg ")).toEqual({ done: "rpg", rest: "" });
    expect(splitTagInput("rp")).toEqual({ rest: "rp" });
  });

  it("builds and compares the listing", () => {
    expect(listingBody({})).toEqual({ tags: [], category: "", language: "" });
    expect(listingDirty({ category: null, tags: [] }, { category: "", tags: [] })).toBe(false);
    expect(listingDirty({ category: "gaming" }, { category: "music" })).toBe(true);
    expect(listingDirty({ tags: ["a"] }, { tags: ["a", "b"] })).toBe(true);
  });

  it("checks custom link names", () => {
    expect(vanityName("  My-Server ")).toBe("my-server");
    expect(isVanityName("my-server")).toBe(true);
    expect(isVanityName("ab")).toBe(false);
    expect(isVanityName("a--b")).toBe(false);
    expect(isVanityName("-ab")).toBe(false);
    expect(isVanityName("x".repeat(33))).toBe(false);
    expect(isVanityName("x".repeat(32))).toBe(true);
  });

  it("follows the link through grace, pause and release", () => {
    const since = new Date("2026-01-01T00:00:00Z");
    expect(vanityState(undefined, since).kind).toBe("active");
    expect(vanityState(since, new Date("2026-01-05T00:00:00Z")).kind).toBe("grace");
    expect(vanityState(since, new Date("2026-02-01T00:00:00Z")).kind).toBe("paused");
    expect(vanityState(since, new Date("2026-06-01T00:00:00Z")).kind).toBe("release");
  });

  it("saves only what changed in Features", () => {
    const current = { user_joined: "c1", user_left: "c2" };
    const stored = featuresFrom("r1", current, ["Members"]);
    expect(featuresBody(stored, stored, current)).toBeNull();
    expect(featuresBody(stored, { ...stored, rules: "none" }, current)).toEqual({ remove: ["RulesChannel"] });
    expect(featuresBody(stored, { ...stored, stats: [] }, current)).toEqual({ remove: ["Stats"] });
    expect(featuresBody(stored, { ...stored, stats: toggleStat(stored.stats, "Roles") }, current)).toEqual({ stats: ["Members", "Roles"], remove: [] });
    const next = { ...stored, messages: { ...stored.messages, user_left: "none", user_banned: "c3" } };
    expect(featuresBody(stored, next, current)).toEqual({ system_messages: { user_joined: "c1", user_banned: "c3" }, remove: [] });
    expect(systemMessagesPatch(null, { user_joined: "none", user_left: "none", user_kicked: "none", user_banned: "none" })).toEqual({});
    expect(toggleStat(["Members", "Roles"], "Members")).toEqual(["Roles"]);
  });
});

describe("wings", () => {
  const levels = [
    { level: 1, supercharges: 2, server_emoji: 100, attachments: 50_000_000, voice_bitrate: 128000, video_resolution: [1280, 720], video_framerate: 30 },
    { level: 2, supercharges: 7, server_emoji: 200, attachments: 100_000_000, voice_bitrate: 256000, video_resolution: [1920, 1080], video_framerate: 60, vanity_invite: true },
  ];

  it("shows the way to the next level", () => {
    expect(wingsProgress(levels, 0)).toMatchObject({ next: { level: 1 }, more: 2, percent: 0 });
    expect(wingsProgress(levels, 3)).toMatchObject({ next: { level: 2 }, more: 4 });
    expect(wingsProgress(levels, 3).percent).toBeCloseTo((3 / 7) * 100);
    expect(wingsProgress(levels, 9)).toEqual({ next: undefined, more: 0, percent: undefined });
  });

  it("formats perks and finds the link level", () => {
    expect(megabytes(50_000_000)).toBe(50);
    expect(kbps(128000)).toBe(128);
    expect(streamQuality([1920, 1080], 60)).toBe("1080p60");
    expect(vanityLevel(levels)?.level).toBe(2);
    expect(vanityLevel([levels[0]])).toBeUndefined();
  });
});
