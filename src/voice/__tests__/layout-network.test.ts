import { barButtons, oklchToHex, phoneTiles, tileHue, tileTint } from "../layout";
import { GOOD_NETWORK, nextNetworkState, qualityWarn, rateQuality, remoteVideoFor } from "../network";
import { clampVolume, personVolume, readVolumes, volumePercent } from "../volumes";

describe("phone call tiles (web phoneCall.css)", () => {
  it("one person: full width at 1 : 0.9", () => {
    expect(phoneTiles(1, 375)).toEqual([{ width: 347, height: 312 }]);
  });
  it("two people: one above the other at 1 : 0.7", () => {
    expect(phoneTiles(2, 375)).toEqual([
      { width: 347, height: 242 },
      { width: 347, height: 242 },
    ]);
  });
  it("more: the first across, the rest two side by side", () => {
    const boxes = phoneTiles(4, 375);
    expect(boxes[0]).toEqual({ width: 347, height: 215 });
    expect(boxes.slice(1)).toEqual([
      { width: 168, height: 176 },
      { width: 168, height: 176 },
      { width: 168, height: 176 },
    ]);
    // two halves and the gap fill the row
    expect(boxes[1].width * 2 + 10).toBeLessThanOrEqual(347);
  });
  it("nobody: no tiles", () => {
    expect(phoneTiles(0, 375)).toEqual([]);
  });
});

describe("tile tint", () => {
  it("keeps the hue between 180 and 359 and is steady per id", () => {
    for (const id of ["01HZZ", "a", "user-123", ""]) {
      const hue = tileHue(id);
      expect(hue).toBeGreaterThanOrEqual(180);
      expect(hue).toBeLessThan(360);
      expect(tileHue(id)).toBe(hue);
    }
  });
  it("matches the web's tileHue for a known id", () => {
    // sum = (0*31 + 97) % 360 = 97 → 180 + 97
    expect(tileHue("a")).toBe(277);
  });
  it("converts OKLCH to sRGB hex", () => {
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(oklchToHex(1, 0, 0)).toBe("#FFFFFF");
    // a dark, slightly saturated tint: every channel well below the middle
    const tint = tileTint("a");
    expect(tint).toMatch(/^#[0-9A-F]{6}$/);
    const channels = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    for (const c of channels) expect(c).toBeLessThan(110);
  });
});

describe("call bar", () => {
  it("52 px buttons and a 64 px hang up when they fit", () => {
    expect(barButtons(5, 375)).toEqual({ size: 52, hangUp: 64 });
  });
  it("shrinks together when there are more, never below 44 px", () => {
    const six = barButtons(6, 375);
    expect(six.size).toBeLessThan(52);
    expect(six.size).toBeGreaterThanOrEqual(44);
    expect(six.hangUp).toBe(six.size + 12);
    expect(barButtons(9, 320).size).toBe(44);
  });
  it("six buttons fit a 375 px phone", () => {
    const { size, hangUp } = barButtons(6, 375);
    expect(size * 5 + hangUp + 8 * 5 + 24 + 28).toBeLessThanOrEqual(375);
  });
});

describe("weak network", () => {
  it("rates LiveKit's quality", () => {
    expect(rateQuality("excellent")).toBe("good");
    expect(rateQuality("good")).toBe("good");
    expect(rateQuality("unknown")).toBe("good");
    expect(rateQuality("poor")).toBe("weak");
    expect(rateQuality("lost")).toBe("bad");
    expect(qualityWarn("poor")).toBe("weak");
    expect(qualityWarn("lost")).toBe("lost");
    expect(qualityWarn("good")).toBeUndefined();
  });
  it("steps down after two worse samples in a row, one level at a time", () => {
    let state = nextNetworkState(GOOD_NETWORK, "bad", 0);
    expect(state.level).toBe("good");
    state = nextNetworkState(state, "bad", 2000);
    expect(state.level).toBe("weak");
    state = nextNetworkState(state, "bad", 4000);
    state = nextNetworkState(state, "bad", 6000);
    expect(state.level).toBe("bad");
  });
  it("a single dip does not step down", () => {
    let state = nextNetworkState(GOOD_NETWORK, "weak", 0);
    state = nextNetworkState(state, "good", 2000);
    state = nextNetworkState(state, "weak", 4000);
    expect(state.level).toBe("good");
  });
  it("steps up after 10 s of better samples", () => {
    let state = { level: "weak" as const, worseCount: 0 };
    let next = nextNetworkState(state, "good", 0);
    next = nextNetworkState(next, "good", 9000);
    expect(next.level).toBe("weak");
    next = nextNetworkState(next, "good", 10000);
    expect(next.level).toBe("good");
    state = { level: "weak", worseCount: 0 };
    // an equal sample resets the recovery clock
    next = nextNetworkState(state, "good", 0);
    next = nextNetworkState(next, "weak", 5000);
    next = nextNetworkState(next, "good", 12000);
    expect(next.level).toBe("weak");
  });
  it("lowers others' video when weak and pauses it when bad", () => {
    expect(remoteVideoFor("good")).toBe("auto");
    expect(remoteVideoFor("weak")).toBe("low");
    expect(remoteVideoFor("bad")).toBe("off");
  });
});

describe("per-person volume", () => {
  it("clamps to 0..300 % and treats nonsense as 100 %", () => {
    expect(clampVolume(5)).toBe(3);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(1);
  });
  it("reads only well-formed entries", () => {
    expect(readVolumes(null)).toEqual({ users: {}, muted: {}, streams: {} });
    expect(readVolumes("not json")).toEqual({ users: {}, muted: {}, streams: {} });
    expect(readVolumes(JSON.stringify({ users: { a: 1.5, b: "x", c: 9 }, muted: { a: true, b: 1 }, streams: { a: 0.5 } }))).toEqual({
      users: { a: 1.5, c: 3 },
      muted: { a: true },
      streams: { a: 0.5 },
    });
  });
  it("plays a voice at the output volume times the person's, silent when muted or deafened", () => {
    expect(personVolume({ outputVolume: 1, person: 1.5, deafened: false })).toBe(1.5);
    expect(personVolume({ outputVolume: 0.5, person: 2, deafened: false })).toBe(1);
    expect(personVolume({ outputVolume: 1, deafened: false })).toBe(1);
    expect(personVolume({ outputVolume: 1, person: 2, muted: true, deafened: false })).toBe(0);
    expect(personVolume({ outputVolume: 1, person: 2, deafened: true })).toBe(0);
  });
  it("formats the slider value like the web", () => {
    expect(volumePercent(1.25)).toBe("125%");
  });
});
