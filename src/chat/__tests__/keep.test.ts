import {
  canAddReminder,
  dueProblem,
  dueReminderOf,
  MAX_DAYS_AHEAD,
  type Reminder,
  splitReminders,
  suggestedCustomTime,
  withArrived,
} from "../keep";

const reminder = (id: string, due: number, delivered?: number): Reminder => ({
  _id: id,
  message: `m${id}`,
  channel: "c",
  due_at: due,
  created_at: 0,
  delivered_at: delivered ?? null,
  available: true,
});

describe("reminder times", () => {
  const now = new Date(2026, 10, 23, 14, 10);

  it("refuses a time that is not ahead", () => {
    expect(dueProblem(undefined, now)).toBe("past");
    expect(dueProblem(now, now)).toBe("past");
    expect(dueProblem(new Date(now.getTime() - 60_000), now)).toBe("past");
  });

  it("refuses a time more than a year ahead", () => {
    const tooFar = new Date(now.getTime() + (MAX_DAYS_AHEAD + 1) * 86_400_000);
    expect(dueProblem(tooFar, now)).toBe("too-far");
  });

  it("accepts a time in between", () => {
    expect(dueProblem(new Date(now.getTime() + 60_000), now)).toBeUndefined();
  });

  it("suggests the next half hour an hour on", () => {
    expect(suggestedCustomTime(new Date(2026, 10, 23, 14, 10)).getMinutes()).toBe(30);
    expect(suggestedCustomTime(new Date(2026, 10, 23, 14, 10)).getHours()).toBe(15);
    const late = suggestedCustomTime(new Date(2026, 10, 23, 14, 40));
    expect([late.getHours(), late.getMinutes()]).toEqual([16, 0]);
    const sharp = suggestedCustomTime(new Date(2026, 10, 23, 14, 0));
    expect([sharp.getHours(), sharp.getMinutes()]).toEqual([15, 0]);
  });
});

describe("reminder lists", () => {
  it("splits waiting (soonest first) from delivered (newest first)", () => {
    const { waiting, due } = splitReminders([reminder("a", 30), reminder("b", 10), reminder("c", 5, 100), reminder("d", 6, 200)]);
    expect(waiting.map((r) => r._id)).toEqual(["b", "a"]);
    expect(due.map((r) => r._id)).toEqual(["d", "c"]);
  });

  it("knows when the limit is reached", () => {
    expect(canAddReminder(3, 10)).toBe(true);
    expect(canAddReminder(10, 10)).toBe(false);
    expect(canAddReminder(99, undefined)).toBe(true);
  });

  it("puts a newly due reminder in front, once", () => {
    const list = [reminder("a", 1), reminder("b", 2)];
    expect(withArrived(list, reminder("b", 2, 5)).map((r) => r._id)).toEqual(["b", "a"]);
    expect(withArrived([], reminder("x", 1)).map((r) => r._id)).toEqual(["x"]);
  });

  it("reads only reminder-due gateway events", () => {
    expect(dueReminderOf({ type: "MessageReminderDue", reminder: reminder("a", 1) })?.reminder._id).toBe("a");
    expect(dueReminderOf({ type: "Message", reminder: reminder("a", 1) })).toBeUndefined();
    expect(dueReminderOf({ type: "MessageReminderDue" })).toBeUndefined();
    expect(dueReminderOf(null)).toBeUndefined();
  });
});
