import {
  canEndPoll,
  draftProblem,
  firstVotedAnswer,
  isClosed,
  moveItem,
  pollPercents,
  pollSummary,
  pollTotal,
  pollsEnabled,
  relativeParts,
  removeAnswer,
  toDataPoll,
  voteAction,
} from "../poll";

let n = 0;
const row = (text: string, emoji?: string) => ({ key: `k${n++}`, text, emoji });

describe("draft", () => {
  it("names what stops a poll", () => {
    expect(draftProblem(" ", [row("a"), row("b")])).toBe("question");
    expect(draftProblem("q", [row("a"), row(" ")])).toBe("answers");
    expect(draftProblem("q", [row("a"), row("x".repeat(56))])).toBe("answer");
    expect(draftProblem("q", [row("a"), row("b")])).toBeUndefined();
  });
  it("sends trimmed answers without empty rows", () => {
    expect(toDataPoll(" Q ", [row(" a ", "🔥"), row(""), row("b")], 24, true)).toEqual({
      question: "Q",
      answers: [{ text: "a", emoji: "🔥" }, { text: "b" }],
      duration: 24,
      allow_multiselect: true,
    });
  });
  it("moves and removes rows like the web", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(removeAnswer([row("a"), row("b")], 0).map((a) => a.text)).toEqual(["", "b"]);
    expect(removeAnswer([row("a"), row("b"), row("c")], 1).map((a) => a.text)).toEqual(["a", "c"]);
  });
});

describe("results", () => {
  const poll = {
    answers: [
      { id: 1, text: "a", count: 1 },
      { id: 2, text: "b", count: 1 },
      { id: 3, text: "c", count: 1 },
    ],
  };
  it("adds percentages up to 100", () => {
    expect(pollTotal(poll)).toBe(3);
    expect(pollPercents(poll)).toEqual([34, 33, 33]);
    expect(pollPercents({ answers: [{ id: 1, text: "a" }] })).toEqual([0]);
  });
  it("votes or takes back, and ends only open polls for the right people", () => {
    expect(voteAction({ me: [2] }, 2)).toBe("unvote");
    expect(voteAction({ me: null }, 2)).toBe("vote");
    expect(canEndPoll({ author: true, manage: false, closed: false })).toBe(true);
    expect(canEndPoll({ author: false, manage: false, closed: false })).toBe(false);
    expect(canEndPoll({ author: true, manage: true, closed: true })).toBe(false);
  });
  it("closes on end or time, and opens voters on a voted answer", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isClosed({ expires_at: "2025-12-31T00:00:00Z" }, now)).toBe(true);
    expect(isClosed({ ended: true, expires_at: "2027-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isClosed({ expires_at: "2027-01-01T00:00:00Z" }, now)).toBe(false);
    expect(firstVotedAnswer({ answers: [{ id: 4 }, { id: 5, count: 2 }] })).toBe(5);
    expect(firstVotedAnswer({ answers: [{ id: 4 }] })).toBe(4);
  });
  it("is on only with a clear yes", () => {
    expect(pollsEnabled({ configuration: { features: { polls: true } } })).toBe(true);
    expect(pollsEnabled({ configuration: { features: {} } })).toBe(false);
    expect(pollsEnabled(null)).toBe(false);
  });
  it("words the time like dayjs fromNow", () => {
    expect(relativeParts(3 * 3_600_000)).toEqual({ value: 3, unit: "hour" });
    expect(relativeParts(23 * 3_600_000)).toEqual({ value: 1, unit: "day" });
    expect(relativeParts(-90_000)).toEqual({ value: -2, unit: "minute" });
  });
  it("sums a poll up for reply previews", () => {
    expect(
      pollSummary({
        question: "Q",
        answers: [{ text: "a", emoji: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }, { text: "b", emoji: "🔥" }, { text: "c" }],
      }),
    ).toBe("📊 Q\n• :01ARZ3NDEKTSV4RRFFQ69G5FAV: a\n• 🔥 b\n• c");
  });
});
