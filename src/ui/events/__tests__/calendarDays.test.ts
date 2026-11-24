import { calendarRange, calendarTitle, chosenAfterMove, dayKey, eventsByDay, keyDay, monthWeeks, moveAnchor, weekOf, weekStartsOn } from "../calendarDays";

const local = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);

describe("the days of a calendar view (web: calendarDays)", () => {
  it("starts the week where the language does", () => {
    expect(weekStartsOn("de")).toBe(1);
    expect(weekStartsOn("en-US")).toBe(0);
    expect([6, 0]).toContain(weekStartsOn("ar"));
  });
  it("gives the seven days of a week", () => {
    // 19 November 2026 is a Thursday
    const week = weekOf(local(2026, 11, 19), 1).map(dayKey);
    expect(week[0]).toBe("2026-11-16");
    expect(week[6]).toBe("2026-11-22");
    expect(weekOf(local(2026, 11, 19), 0).map(dayKey)[0]).toBe("2026-11-15");
  });
  it("covers a month with whole weeks", () => {
    const weeks = monthWeeks(local(2026, 11, 19), 1);
    expect(dayKey(weeks[0][0])).toBe("2026-10-26");
    expect(dayKey(weeks[weeks.length - 1][6])).toBe("2026-12-06");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("asks for the span the view shows", () => {
    const range = calendarRange("week", local(2026, 11, 19), 1);
    expect(dayKey(range.from)).toBe("2026-11-16");
    expect(dayKey(range.to)).toBe("2026-11-23");
    expect(calendarRange("month", local(2026, 11, 19), 1).days.length % 7).toBe(0);
  });
  it("steps by a week or a month", () => {
    expect(dayKey(moveAnchor("week", local(2026, 11, 19), 1))).toBe("2026-11-26");
    expect(dayKey(moveAnchor("month", local(2026, 11, 19), -1))).toBe("2026-10-01");
  });
  it("keeps the chosen day if it is still shown", () => {
    expect(chosenAfterMove("week", local(2026, 11, 26), 1, "2026-11-19")).toBe("2026-11-26");
    expect(chosenAfterMove("month", local(2026, 12, 1), 1, "2026-11-30")).toBe("2026-11-30");
    expect(chosenAfterMove("month", local(2027, 1, 1), 1, "2026-11-30")).toBe("2027-01-01");
  });
  it("groups events by their local day, soonest first", () => {
    const a = { starts_at: local(2026, 11, 19, 20).toISOString() };
    const b = { starts_at: local(2026, 11, 19, 9).toISOString() };
    const c = { starts_at: local(2026, 11, 20, 9).toISOString() };
    const days = eventsByDay([a, b, c]);
    expect(days.get("2026-11-19")).toEqual([b, a]);
    expect(days.get("2026-11-20")).toEqual([c]);
  });
  it("turns keys back into days and titles the view", () => {
    expect(dayKey(keyDay("2026-02-28"))).toBe("2026-02-28");
    expect(calendarTitle("month", local(2026, 11, 19), 1, "en")).toContain("2026");
    expect(calendarTitle("week", local(2026, 11, 19), 1, "en")).toMatch(/16/);
  });
});
