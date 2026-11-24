import { audioDuration, knownSeconds, readDuration } from "../audioDuration";

jest.mock("expo-audio", () => ({ createAudioPlayer: jest.fn() }));

type Listener = (status: { isLoaded: boolean; duration: number }) => void;

function fakePlayer(start: { isLoaded: boolean; duration: number }) {
  let listener: Listener | undefined;
  const player = {
    ...start,
    removed: false,
    subscribed: true,
    addListener: (_: string, fn: Listener) => {
      listener = fn;
      return { remove: () => (player.subscribed = false) };
    },
    remove: () => (player.removed = true),
    emit: (status: { isLoaded: boolean; duration: number }) => listener?.(status),
  };
  return player;
}

describe("audio length before playing", () => {
  it("takes only a loaded, real length", () => {
    expect(knownSeconds({ isLoaded: true, duration: 4.2 })).toBe(4.2);
    expect(knownSeconds({ isLoaded: false, duration: 4.2 })).toBeUndefined();
    expect(knownSeconds({ isLoaded: true, duration: 0 })).toBeUndefined();
    expect(knownSeconds({ isLoaded: true, duration: NaN })).toBeUndefined();
    expect(knownSeconds({ isLoaded: true, duration: Infinity })).toBeUndefined();
  });

  it("reads the length once the file is loaded, then releases the player", async () => {
    const player = fakePlayer({ isLoaded: false, duration: 0 });
    const reading = readDuration("https://cdn/a", () => player as never);
    player.emit({ isLoaded: true, duration: 0 });
    player.emit({ isLoaded: true, duration: 12.5 });
    await expect(reading).resolves.toBe(12.5);
    expect(player.removed).toBe(true);
    expect(player.subscribed).toBe(false);
  });

  it("answers at once when the player already knows", async () => {
    const player = fakePlayer({ isLoaded: true, duration: 3 });
    await expect(readDuration("https://cdn/b", () => player as never)).resolves.toBe(3);
    expect(player.removed).toBe(true);
  });

  it("gives up after a while", async () => {
    jest.useFakeTimers();
    const player = fakePlayer({ isLoaded: false, duration: 0 });
    const reading = readDuration("https://cdn/c", () => player as never);
    jest.advanceTimersByTime(10_000);
    await expect(reading).resolves.toBeNull();
    expect(player.removed).toBe(true);
    jest.useRealTimers();
  });

  it("gives nothing when the player can't be made", async () => {
    await expect(
      readDuration("x", () => {
        throw new Error("no");
      }),
    ).resolves.toBeNull();
  });

  it("remembers lengths learned while playing", () => {
    expect(audioDuration.peek("https://cdn/d")).toBeUndefined();
    audioDuration.remember("https://cdn/d", 8);
    audioDuration.remember("https://cdn/e", NaN);
    expect(audioDuration.peek("https://cdn/d")).toBe(8);
    expect(audioDuration.peek("https://cdn/e")).toBeUndefined();
    const done = jest.fn();
    audioDuration.request("https://cdn/d", done);
    expect(done).toHaveBeenCalledWith(8);
  });
});
