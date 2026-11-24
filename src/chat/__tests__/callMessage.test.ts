import { setupI18n } from "@lingui/core";

import { callDuration, callLine, durationParts } from "../callMessage";
import { dayjsFormat, messageTime } from "../time";

const ME = "01ME";
const THEM = "01THEM";
const START = Date.UTC(2026, 10, 18, 6, 46, 0);

describe("callLine (web SystemMessage, call_started)", () => {
  it("missed calls: mine nobody answered, theirs I missed", () => {
    expect(callLine({ by: ME, finished_at: "2026-11-18T06:47:24.069Z", missed: true }, START, ME)).toEqual({ kind: "unanswered" });
    expect(callLine({ by: THEM, finished_at: "2026-11-18T06:47:24.069Z", missed: true }, START, ME)).toEqual({ kind: "missed", by: THEM });
  });

  it("an answered call that ended: how long it lasted", () => {
    expect(callLine({ by: THEM, finished_at: "2026-11-18T06:51:00.000Z" }, START, ME)).toEqual({ kind: "lasted", by: THEM, ms: 5 * 60_000 });
  });

  it("a call still going", () => {
    expect(callLine({ by: THEM, finished_at: null }, START, ME)).toEqual({ kind: "started", by: THEM });
    expect(callLine({ by: THEM }, START, ME)).toEqual({ kind: "started", by: THEM });
  });

  it("without my id a missed call is someone else's", () => {
    expect(callLine({ by: ME, missed: true }, START)).toEqual({ kind: "missed", by: ME });
  });

  it("a finish before the start never gives a negative length", () => {
    expect(callLine({ by: THEM, finished_at: "2026-11-18T06:45:00.000Z" }, START, ME)).toEqual({ kind: "lasted", by: THEM, ms: 0 });
  });
});

describe("durationParts (dayjs from(start, true) thresholds)", () => {
  const s = 1000;
  const m = 60 * s;
  const h = 60 * m;
  const d = 24 * h;
  it.each([
    [0, 1, "second"],
    [14 * s, 14, "second"],
    [44 * s, 44, "second"],
    [45 * s, 1, "minute"],
    [89 * s, 1, "minute"],
    [90 * s, 2, "minute"],
    [44 * m, 44, "minute"],
    [45 * m, 1, "hour"],
    [89 * m, 1, "hour"],
    [90 * m, 2, "hour"],
    [21 * h, 21, "hour"],
    [22 * h, 1, "day"],
    [35 * h, 1, "day"],
    [36 * h, 2, "day"],
    [25 * d, 25, "day"],
    [26 * d, 1, "month"],
    [60 * d, 2, "month"],
    [400 * d, 1, "year"],
    [800 * d, 2, "year"],
  ])("%p ms is %p %p", (ms, value, unit) => {
    expect(durationParts(ms)).toEqual({ value, unit });
  });
});

describe("callDuration", () => {
  it("writes the length in the app's language", () => {
    expect(callDuration(5 * 60_000, "en")).toBe("5 minutes");
    expect(callDuration(60 * 60_000, "en")).toBe("1 hour");
    expect(callDuration(14_000, "en")).toBe("14 seconds");
    expect(callDuration(5 * 60_000, "ar")).toMatch(/دقائق/);
  });
});

describe("messageTime (dayjs calendar with the web's formats)", () => {
  const i18n = setupI18n({ locale: "en", messages: { en: {} } });
  // Wednesday 18 November 2026, 12:00 local time
  const now = new Date(2026, 10, 18, 12, 0);
  const at = (days: number) => new Date(2026, 10, 18 + days, 15, 4);

  it("today, yesterday and tomorrow", () => {
    expect(messageTime(i18n, at(0), now)).toMatch(/^Today at 15:04$/);
    expect(messageTime(i18n, at(-1), now)).toMatch(/^Yesterday at 15:04$/);
    expect(messageTime(i18n, at(1), now)).toMatch(/^Tomorrow at 15:04$/);
  });

  it("two to six days back: Last weekday", () => {
    expect(messageTime(i18n, at(-2), now)).toBe("Last Monday at 15:04");
    expect(messageTime(i18n, at(-6), now)).toBe("Last Thursday at 15:04");
  });

  it("two to six days ahead: the weekday", () => {
    expect(messageTime(i18n, at(2), now)).toBe("Friday at 15:04");
  });

  it("a week or more away: the date and time", () => {
    expect(messageTime(i18n, at(-7), now)).toBe("11/11/2026 15:04");
    expect(messageTime(i18n, at(7), now)).toBe("25/11/2026 15:04");
  });

  it("fills dddd with the weekday of the app's language (the Arabic format puts it first)", () => {
    expect(dayjsFormat("dddd [الماضي الساعة] LT", at(-2), "ar")).toMatch(/^الاثنين الماضي الساعة /);
  });
});
