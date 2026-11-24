// Ported from the web app (interface/designs/early.test.ts), plus the phone's signed-in request
import {
  EARLY_KINDS,
  clearEarly,
  opensWall,
  startEarlyDesigns,
  takeEarly,
} from "../early";

const realFetch = global.fetch;

afterEach(() => {
  clearEarly();
  global.fetch = realFetch;
});

describe("the wall's first page, asked for early", () => {
  it("knows which addresses open on the wall", () => {
    for (const path of ["/", "", "/looks", "/decorations/", "/community"])
      expect(opensWall(path)).toBe(true);
    for (const path of [
      "/creators",
      "/creator/01ABC",
      "/favourites",
      "/studio",
      "/laurel",
      "/c-01M6SHN0AHBNEZE7APT742WJHM",
    ])
      expect(opensWall(path)).toBe(false);
  });

  it("asks for each kind once, without credentials, as the web site does", () => {
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetch as never;
    startEarlyDesigns("https://api.example.test/");
    expect(fetch).toHaveBeenCalledTimes(EARLY_KINDS.length);
    for (const kind of EARLY_KINDS)
      expect(fetch).toHaveBeenCalledWith(
        `https://api.example.test/community/${kind}?sort=popular&limit=48`,
        { credentials: "omit" },
      );
  });

  it("asks with the session on the phone, so favourites are marked", () => {
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetch as never;
    startEarlyDesigns("https://api.example.test", { "X-Session-Token": "s" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/community/decorations?sort=popular&limit=48",
      { headers: { "X-Session-Token": "s" } },
    );
  });

  it("hands each answer out once", async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ items: [url], creators: [] }),
    })) as never;
    startEarlyDesigns("https://api.example.test");
    const first = takeEarly<{ items: string[] }>("nameplates");
    expect((await first)?.items[0]).toContain("/community/nameplates?");
    expect(takeEarly("nameplates")).toBeUndefined();
    expect(takeEarly("unknown")).toBeUndefined();
  });

  it("passes a failed answer on as a failure, never as data", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as never;
    startEarlyDesigns("https://api.example.test");
    await expect(takeEarly("effects")).rejects.toThrow("503");
  });
});
