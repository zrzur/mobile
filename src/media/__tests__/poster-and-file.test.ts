import { clearPressedFile, markPressedFile, pickSheetFile, savesToPhotos, type SheetFile } from "../pressedFile";
import { createPosterQueue, posterClock } from "../posterQueue";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("video poster queue", () => {
  it("makes at most `limit` posters at a time and each address once", async () => {
    const calls: string[] = [];
    const resolvers: (() => void)[] = [];
    const queue = createPosterQueue<string>({
      limit: 2,
      generate: (uri) =>
        new Promise((resolve) => {
          calls.push(uri);
          resolvers.push(() => resolve({ image: `img:${uri}`, width: 10, height: 10, seconds: 5 }));
        }),
    });
    const got: (string | undefined)[] = [];
    queue.request("a", (p) => got.push(p?.image));
    queue.request("a", (p) => got.push(p?.image));
    queue.request("b", (p) => got.push(p?.image));
    queue.request("c", (p) => got.push(p?.image));
    expect(calls).toEqual(["a", "b"]);
    expect(queue.running()).toBe(2);
    resolvers[0]();
    await flush();
    expect(got).toEqual(["img:a", "img:a"]);
    expect(calls).toEqual(["a", "b", "c"]);
    // a made poster is answered at once, without a new call
    let again: string | undefined;
    queue.request("a", (p) => (again = p?.image));
    expect(again).toBe("img:a");
    expect(queue.peek("a")?.image).toBe("img:a");
    expect(calls.length).toBe(3);
  });

  it("drops a request cancelled before it starts", async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const queue = createPosterQueue<string>({
      limit: 1,
      generate: (uri) => {
        calls.push(uri);
        return new Promise((resolve) => (release = () => resolve(null)));
      },
    });
    queue.request("a", () => {});
    const cancel = queue.request("b", () => {
      throw new Error("should not be called");
    });
    cancel();
    release();
    await flush();
    expect(calls).toEqual(["a"]);
  });

  it("a failure is remembered as none and not tried again", async () => {
    let n = 0;
    const queue = createPosterQueue<string>({ generate: () => (n++, Promise.reject(new Error("x"))) });
    let result: unknown = "unset";
    queue.request("a", (p) => (result = p));
    await flush();
    expect(result).toBeNull();
    queue.request("a", (p) => (result = p));
    expect(n).toBe(1);
  });

  it("keeps only the newest posters", async () => {
    const queue = createPosterQueue<string>({ keep: 2, generate: (uri) => Promise.resolve({ image: uri, width: 1, height: 1 }) });
    for (const u of ["a", "b", "c"]) queue.request(u, () => {});
    await flush();
    await flush();
    expect(queue.peek("a")).toBeUndefined();
    expect(queue.peek("c")?.image).toBe("c");
  });

  it("shows the length like a player", () => {
    expect(posterClock(65)).toBe("1:05");
    expect(posterClock(720)).toBe("12:00");
    expect(posterClock(3723)).toBe("1:02:03");
    expect(posterClock(0)).toBeUndefined();
    expect(posterClock(NaN)).toBeUndefined();
    expect(posterClock(undefined)).toBeUndefined();
  });
});

describe("the file the message sheet acts on", () => {
  const a: SheetFile = { id: "A", url: "https://cdn/a.png", name: "a.png", kind: "image" };
  const b: SheetFile = { id: "B", url: "https://cdn/b.pdf", name: "b.pdf", kind: "file" };
  afterEach(clearPressedFile);

  it("the only file, without a hold on it", () => {
    expect(pickSheetFile("m1", [a])).toBe(a);
    expect(pickSheetFile("m1", [])).toBeNull();
  });

  it("several files: only the held one", () => {
    expect(pickSheetFile("m1", [a, b])).toBeNull();
    markPressedFile("m1", "B", 1000);
    expect(pickSheetFile("m1", [a, b], 1500)).toBe(b);
  });

  it("a hold on another message or an old hold does not count", () => {
    markPressedFile("m2", "B", 1000);
    expect(pickSheetFile("m1", [a, b], 1500)).toBeNull();
    markPressedFile("m1", "B", 1000);
    expect(pickSheetFile("m1", [a, b], 9000)).toBeNull();
  });

  it("pictures and videos go to Photos, other files through the share sheet", () => {
    expect(savesToPhotos(a)).toBe(true);
    expect(savesToPhotos({ ...a, kind: "video" })).toBe(true);
    expect(savesToPhotos(b)).toBe(false);
    expect(savesToPhotos({ ...b, kind: "audio" })).toBe(false);
  });
});
