import {
  answerAction,
  compareEvents,
  createBody,
  editBody,
  type EditorDraft,
  eventLink,
  eventMatches,
  eventPhase,
  eventTimeProblem,
  namesShown,
  pickerDays,
  placeLink,
  roundUp,
  seatCount,
  seatState,
  shareLink,
  toggleReminder,
  upcomingCount,
  withTime,
} from "../eventFormat";
import type { ServerEvent } from "../types";

const event = (over: Partial<ServerEvent> = {}): ServerEvent => ({
  _id: "E1",
  server: "S1",
  creator: "U1",
  title: "Game night",
  starts_at: "2026-12-01T18:00:00.000Z",
  place: { type: "Voice", channel: "C1" },
  status: "Scheduled",
  interested_count: 0,
  ...over,
});

const draft = (over: Partial<EditorDraft> = {}): EditorDraft => ({
  title: " Game night ",
  description: "",
  start: new Date("2026-12-01T18:00:00.000Z"),
  end: new Date("2026-12-01T20:00:00.000Z"),
  place: { type: "Voice", channel: "C1" },
  visibility: "Place",
  roles: [],
  attendeeList: "Organisers",
  waitlist: true,
  reminders: [1440, 15],
  ...over,
});

describe("event phase and order", () => {
  const now = Date.parse("2026-12-01T17:30:00.000Z");
  it("is live while active, soon within an hour, later after, over otherwise", () => {
    expect(eventPhase(event({ status: "Active" }), now)).toBe("live");
    expect(eventPhase(event(), now)).toBe("soon");
    expect(eventPhase(event({ starts_at: "2026-12-02T18:00:00.000Z" }), now)).toBe("later");
    expect(eventPhase(event({ status: "Cancelled" }), now)).toBe("over");
    expect(eventPhase(event({ status: "Draft" }), now)).toBe("over");
  });
  it("puts happening events first, then the soonest", () => {
    const list = [event({ _id: "b", starts_at: "2026-12-03T00:00:00Z" }), event({ _id: "a", starts_at: "2026-12-02T00:00:00Z" }), event({ _id: "live", status: "Active", starts_at: "2026-12-05T00:00:00Z" })];
    expect([...list].sort(compareEvents).map((e) => e._id)).toEqual(["live", "a", "b"]);
  });
  it("counts scheduled and active ones", () => {
    expect(upcomingCount([event(), event({ status: "Active" }), event({ status: "Completed" }), event({ status: "Draft" })])).toBe(2);
  });
});

describe("seats", () => {
  it("has no limit without a capacity", () => {
    expect(seatState(event({ counts: { going: 3, maybe: 0, not_going: 0, waiting: 0 } }))).toMatchObject({ capacity: undefined, full: false, left: undefined, share: 0 });
  });
  it("is full at the capacity and keeps the waiting count", () => {
    expect(seatState(event({ capacity: 4, counts: { going: 4, maybe: 1, not_going: 0, waiting: 2 } }))).toMatchObject({ full: true, left: 0, waiting: 2, share: 1 });
    expect(seatState(event({ capacity: 4, counts: { going: 1, maybe: 0, not_going: 0, waiting: 0 } }))).toMatchObject({ full: false, left: 3, share: 0.25 });
  });
  it("accepts 1 to 10000 whole seats only", () => {
    expect(seatCount("16")).toBe(16);
    expect(seatCount("0")).toBeUndefined();
    expect(seatCount("2.5")).toBeUndefined();
    expect(seatCount("10001")).toBeUndefined();
    expect(seatCount("")).toBeUndefined();
  });
});

describe("answers and names", () => {
  it("withdraws when the same answer is pressed again", () => {
    expect(answerAction("Going", "Going")).toBe("withdraw");
    expect(answerAction("Maybe", "Going")).toBe("set");
    expect(answerAction(undefined, "NotGoing")).toBe("set");
  });
  it("shows names to organisers, everyone, or participants as set", () => {
    expect(namesShown(event({ attendee_list: "Organisers" }), true)).toBe(true);
    expect(namesShown(event({ attendee_list: "Organisers" }), false, { answer: "Going" })).toBe(false);
    expect(namesShown(event({ attendee_list: "Participants" }), false, { answer: "Maybe" })).toBe(true);
    expect(namesShown(event({ attendee_list: "Participants" }), false, { answer: "NotGoing" })).toBe(false);
    expect(namesShown(event({ attendee_list: "Everyone" }), false)).toBe(true);
    expect(namesShown(event({ attendee_list: "Everyone", people_removed_at: "2026-01-01" }), true)).toBe(false);
  });
});

describe("search and places", () => {
  it("matches every word in title or description, and the place", () => {
    const e = event({ description: "Bring a controller" });
    expect(eventMatches(e, "game controller", "any")).toBe(true);
    expect(eventMatches(e, "chess", "any")).toBe(false);
    expect(eventMatches(e, "", "Text")).toBe(false);
    expect(eventMatches(e, "", "Voice")).toBe(true);
  });
  it("reads only http links as links", () => {
    expect(placeLink({ type: "External", location: "https://zrzur.com/x" })).toBe("https://zrzur.com/x");
    expect(placeLink({ type: "External", location: "Vienna, Prater" })).toBeUndefined();
    expect(placeLink({ type: "Voice", channel: "C" })).toBeUndefined();
  });
  it("builds the app and share links", () => {
    expect(eventLink("https://app.zrzur.com/", "S", "E")).toBe("https://app.zrzur.com/server/S/events/E");
    expect(shareLink("https://zrzur.cc", { code: "ab12" })).toBe("https://zrzur.cc/e/ab12");
    expect(shareLink("https://zrzur.cc/", { code: "ab12", name: "game-night" })).toBe("https://zrzur.cc/e/game-night-ab12");
  });
});

describe("editor", () => {
  const now = new Date("2026-12-01T12:00:00.000Z");
  it("finds time problems in the web's order", () => {
    expect(eventTimeProblem(undefined, undefined, now, true)).toBe("start-missing");
    expect(eventTimeProblem(new Date("2026-12-01T11:00:00Z"), undefined, now, true)).toBe("start-past");
    expect(eventTimeProblem(new Date("2026-12-01T11:00:00Z"), undefined, now, false)).toBeUndefined();
    expect(eventTimeProblem(new Date("2026-12-01T13:00:00Z"), new Date("2026-12-01T13:00:00Z"), now, true)).toBe("end-before");
    expect(eventTimeProblem(new Date("2026-12-01T13:00:00Z"), new Date("2027-01-05T13:00:00Z"), now, true)).toBe("end-long");
  });
  it("keeps at most three reminders", () => {
    expect(toggleReminder([1440, 15], 60, true)).toEqual([1440, 15, 60]);
    expect(toggleReminder([1440, 15, 60], 10080, true)).toEqual([1440, 15, 60]);
    expect(toggleReminder([1440, 15], 15, false)).toEqual([1440]);
  });
  it("rounds up to the next half hour", () => {
    expect(roundUp(new Date("2026-12-01T12:10:00Z"), 30).toISOString()).toBe("2026-12-01T12:30:00.000Z");
  });
  it("offers days from today at midnight, and puts a time on a day", () => {
    const days = pickerDays(new Date(2026, 11, 31, 15, 0), 3);
    expect(days.map((d) => [d.getMonth(), d.getDate(), d.getHours()])).toEqual([
      [11, 31, 0],
      [0, 1, 0],
      [0, 2, 0],
    ]);
    expect(withTime(days[1], 21, 30).getHours()).toBe(21);
  });
  it("creates with trimmed text and no seat fields without a limit", () => {
    const body = createBody(draft(), "Europe/Vienna", false);
    expect(body).toMatchObject({ title: "Game night", time_zone: "Europe/Vienna", visibility: "Place", capacity: undefined, waitlist: undefined, draft: undefined });
    expect(body.description).toBeUndefined();
    expect(createBody(draft({ seats: 16, visibility: "Roles", roles: ["R"] }), "UTC", true)).toMatchObject({ capacity: 16, waitlist: true, visible_roles: ["R"], draft: true });
  });
  it("edits: clears what was taken away and leaves the start of a running event", () => {
    const existing = event({ description: "x", ends_at: "2026-12-01T20:00:00.000Z", repeat: "Weekly", capacity: 8, cover: { _id: "F" } });
    const body = editBody(draft({ end: undefined, removeCover: true }), existing);
    expect(body.remove).toEqual(["Description", "EndsAt", "Repeat", "Cover", "Capacity"]);
    expect(body.starts_at).toBeUndefined();
    const moved = editBody(draft({ start: new Date("2026-12-02T18:00:00.000Z") }), event({ status: "Active" }));
    expect(moved.starts_at).toBeUndefined();
    const invited = editBody(draft(), event({ visibility: "Invited" }));
    expect(invited.visibility).toBeUndefined();
  });
});
