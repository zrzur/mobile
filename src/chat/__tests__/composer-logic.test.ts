import { applyCompletion, findTrigger, rank } from "../autocomplete";
import { cleanDrafts, withDraft } from "../drafts";
import { humanFileSize, lengthState, splitBySize } from "../limits";

const ID = "01HZZZZZZZZZZZZZZZZZZZZZZZ";

describe("autocomplete trigger", () => {
  it("finds @, # and : words at the cursor", () => {
    expect(findTrigger("hi @ma", 6)).toEqual({ operator: "@", query: "ma", start: 3, end: 6 });
    expect(findTrigger("#gen", 4)).toEqual({ operator: "#", query: "gen", start: 0, end: 4 });
    expect(findTrigger("ok :smi", 7)?.operator).toBe(":");
    expect(findTrigger("@", 1)).toEqual({ operator: "@", query: "", start: 0, end: 1 });
  });

  it("ignores operators inside words, a bare colon and finished words", () => {
    expect(findTrigger("mail@me", 7)).toBeUndefined();
    expect(findTrigger("time 10:30", 10)).toBeUndefined();
    expect(findTrigger("see :", 5)).toBeUndefined();
    expect(findTrigger("@ma done", 8)).toBeUndefined();
  });

  it("puts the pick in place of the typed word", () => {
    const text = "hey @ma and";
    const trigger = findTrigger(text, 7)!;
    expect(applyCompletion(text, trigger, "<@X>")).toEqual({ text: "hey <@X> and", cursor: 9 });
  });

  it("ranks names that start with the query first, Arabic folded", () => {
    const people = ["Samir", "Amir", "أمير"];
    expect(rank(people, "am", (p) => [p])).toEqual(["Amir", "Samir"]);
    expect(rank(people, "امير", (p) => [p])).toEqual(["أمير"]);
    expect(rank(people, "", (p) => [p], 2)).toEqual(["Samir", "Amir"]);
  });
});

describe("drafts", () => {
  it("keeps only good drafts, newest first, at most 200", () => {
    const raw: Record<string, unknown> = { [ID]: { content: "hello", at: 5 }, bad: { content: "x", at: 1 }, ["01HYYYYYYYYYYYYYYYYYYYYYYY"]: { content: "  ", at: 9 } };
    expect(cleanDrafts(raw)).toEqual({ [ID]: { content: "hello", at: 5 } });
    expect(cleanDrafts(null)).toEqual({});
  });

  it("empty text removes a draft", () => {
    const d = withDraft({}, ID, "hi", 1);
    expect(d[ID].content).toBe("hi");
    expect(withDraft(d, ID, " ", 2)).toEqual({});
  });
});

describe("composer limits", () => {
  it("shows the counter in the last 200 characters", () => {
    expect(lengthState(1700, 2000)).toEqual({ show: false });
    expect(lengthState(1900, 2000)).toEqual({ show: true, left: 100, over: false, wayOver: false });
    expect(lengthState(2001, 2000)).toMatchObject({ over: true, left: -1 });
    expect(lengthState(13000, 2000)).toMatchObject({ wayOver: true });
  });

  it("formats sizes and refuses files over the limit", () => {
    expect(humanFileSize(500)).toBe("500 B");
    expect(humanFileSize(1536)).toBe("1.5 KB");
    expect(humanFileSize(20 * 1024 * 1024)).toBe("20 MB");
    const { ok, tooLarge } = splitBySize([{ size: 10 }, { size: 30 }, {}], 20);
    expect(ok).toEqual([{ size: 10 }, {}]);
    expect(tooLarge).toEqual([{ size: 30 }]);
  });
});
