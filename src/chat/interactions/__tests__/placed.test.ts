import { placedAttachments } from "../logic";

describe("files a message's blocks already show", () => {
  it("collects File, Gallery items and Section thumbnails, inside Containers too", () => {
    const ids = placedAttachments([
      { type: "File", attachment: "f1" },
      { type: "Gallery", items: [{ attachment: "g1" }, { url: "https://x/y.png" }, { attachment: "g2" }] },
      { type: "Section", components: [], thumbnail: { attachment: "s1" } },
      { type: "Container", components: [{ type: "File", attachment: "c1" }, { type: "Unknown", attachment: "no" }] },
      { type: "Text", content: "hi" },
      { type: "Mystery", attachment: "no2" },
    ]);
    expect([...ids].sort()).toEqual(["c1", "f1", "g1", "g2", "s1"]);
  });

  it("nothing without blocks", () => {
    expect(placedAttachments(undefined).size).toBe(0);
    expect(placedAttachments([]).size).toBe(0);
    expect(placedAttachments([null, 3, "x"]).size).toBe(0);
  });
});
