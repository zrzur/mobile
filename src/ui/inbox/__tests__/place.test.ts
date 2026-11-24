import { dayGroup, filesSummary, placeParts } from "../place";

const words = { directMessage: "Direct message", savedNotes: "Saved notes" };

describe("placeParts", () => {
  it("keeps server and channel apart", () => {
    expect(placeParts({ type: "TextChannel", name: "عام", server: { name: "Zrzur" } }, words)).toEqual(["Zrzur", "#عام"]);
  });

  it("names direct messages and saved notes", () => {
    expect(placeParts({ type: "DirectMessage" }, words)).toEqual(["Direct message"]);
    expect(placeParts({ type: "SavedMessages" }, words)).toEqual(["Saved notes"]);
  });

  it("a group has only its name; nothing for an unknown channel", () => {
    expect(placeParts({ type: "Group", name: "Friends" }, words)).toEqual(["#Friends"]);
    expect(placeParts(undefined, words)).toEqual([]);
  });
});

describe("filesSummary", () => {
  it("names the first file and counts the rest", () => {
    expect(filesSummary([{ filename: "a.png" }, { filename: "b.png" }, {}], "File")).toEqual({ first: "a.png", more: 2 });
    expect(filesSummary([{}], "File")).toEqual({ first: "File", more: 0 });
    expect(filesSummary([], "File")).toBeUndefined();
    expect(filesSummary(undefined, "File")).toBeUndefined();
  });
});

describe("dayGroup", () => {
  const now = new Date(2026, 10, 23, 9, 0);
  it("groups by local day", () => {
    expect(dayGroup(new Date(2026, 10, 23, 0, 5), now)).toBe("today");
    expect(dayGroup(new Date(2026, 10, 22, 23, 59), now)).toBe("yesterday");
    expect(dayGroup(new Date(2026, 10, 20, 12, 0), now)).toBe("earlier");
  });
});
