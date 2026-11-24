// Ported from the web app (interface/designs/rank.test.ts)
import type { CommunityCreator, CommunityItem } from "../api";
import { isFeature, mergePages, rankCreators } from "../rank";

const creator = (id: string) =>
  ({ _id: id, display_name: id, verified: true }) as CommunityCreator;
const item = (
  id: string,
  by: string,
  popularity: number,
  kind: CommunityItem["kind"] = "Decoration",
) =>
  ({ _id: id, creator_id: by, popularity, kind }) as unknown as CommunityItem;

describe("rankCreators", () => {
  it("orders creators by wear and then by number of designs", () => {
    const ranked = rankCreators(
      mergePages([
        {
          items: [item("a", "x", 5), item("b", "y", 5), item("c", "y", 0)],
          creators: [creator("x"), creator("y")],
        },
      ]),
    );
    expect(ranked.map((entry) => entry.creator._id)).toEqual(["y", "x"]);
    expect(ranked[0].designs).toBe(2);
    expect(ranked[0].uses).toBe(5);
  });

  it("keeps the most worn design on top and the best nameplate as cover", () => {
    const [entry] = rankCreators({
      creators: { x: creator("x") },
      items: [
        item("low", "x", 1),
        item("plate", "x", 3, "Nameplate"),
        item("top", "x", 9),
        item("other", "x", 2, "Nameplate"),
      ],
    });
    expect(entry.top._id).toBe("top");
    expect(entry.cover?._id).toBe("plate");
    expect(entry.shelf.map((one) => one._id)).toEqual([
      "top",
      "plate",
      "other",
      "low",
    ]);
  });

  it("skips designs whose creator is hidden from this viewer", () => {
    expect(
      rankCreators({ creators: {}, items: [item("a", "ghost", 4)] }),
    ).toEqual([]);
  });

  it("keeps at most six designs on a shelf", () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`d${i}`, "x", i));
    expect(
      rankCreators({ creators: { x: creator("x") }, items })[0].shelf,
    ).toHaveLength(6);
  });
});

describe("isFeature", () => {
  it("marks the first tile and then one in every seven", () => {
    expect([0, 1, 6, 7, 13, 14].map((i) => isFeature(i))).toEqual([
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });
});
