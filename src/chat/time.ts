import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * Times like the web app (dayjs): lists show "LT" today, "Yesterday",
 * the weekday this week, else the short date; messages use the calendar
 * form "Today at 3:04 PM". The calendar strings are the web's own
 * (`[Today at] LT`, …), so all seven languages come from its catalogs.
 */

const TODAY = msg({ id: "[Today at] LT", message: "[Today at] LT" });
const YESTERDAY_AT = msg({ id: "[Yesterday at] LT", message: "[Yesterday at] LT" });
const TOMORROW_AT = msg({ id: "[Tomorrow at] LT", message: "[Tomorrow at] LT" });
const LAST_WEEK = msg({ id: "[Last] dddd [at] LT", message: "[Last] dddd [at] LT" });
const NEXT_WEEK = msg({ id: "dddd [at] LT", message: "dddd [at] LT" });
const YESTERDAY = msg`Yesterday`;

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(a: Date, b: Date) {
  return Math.round((dayStart(b) - dayStart(a)) / 86_400_000);
}

/** Intl's locale tag for our language codes */
export function intlLocale(locale: string) {
  return locale === "zh-Hans" ? "zh-CN" : locale;
}

/**
 * The locale dates and clock times are written in. The web's "en" is
 * English (UK) and formats with dayjs "en-gb" (18:41, 18 November 2026,
 * 18/11/2026), so the phone does the same.
 */
export function dateLocale(locale: string) {
  return locale === "en" ? "en-GB" : intlLocale(locale);
}

export function clock(date: Date, locale: string) {
  return new Intl.DateTimeFormat(dateLocale(locale), { hour: "numeric", minute: "2-digit" }).format(date);
}

export function shortDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(dateLocale(locale), { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function longDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(dateLocale(locale), { year: "numeric", month: "long", day: "numeric" }).format(date);
}

/** Fill a dayjs format like "[Last] dddd [at] LT": bracket text kept, dddd = weekday, LT = clock */
export function dayjsFormat(format: string, date: Date, locale: string) {
  return format.replace(/\[([^\]]*)\]|dddd|LT/g, (match, literal) =>
    literal !== undefined ? literal : match === "dddd" ? new Intl.DateTimeFormat(dateLocale(locale), { weekday: "long" }).format(date) : clock(date, locale),
  );
}

/** Conversation list time */
export function listTime(i18n: I18n, date: Date, now = new Date()): string {
  const days = daysBetween(date, now);
  if (days <= 0) return clock(date, i18n.locale);
  if (days === 1) return i18n._(YESTERDAY);
  if (days < 7) return new Intl.DateTimeFormat(dateLocale(i18n.locale), { weekday: "long" }).format(date);
  return shortDate(date, i18n.locale);
}

/**
 * Message header time: dayjs `calendar` with the web's formats (today,
 * yesterday, "Last Tuesday at 15:04" up to six days back, and tomorrow and
 * the coming weekdays for reminders), else the date and time
 */
export function messageTime(i18n: I18n, date: Date, now = new Date()): string {
  const days = daysBetween(date, now);
  if (days === 0) return dayjsFormat(i18n._(TODAY), date, i18n.locale);
  if (days === 1) return dayjsFormat(i18n._(YESTERDAY_AT), date, i18n.locale);
  if (days >= 2 && days <= 6) return dayjsFormat(i18n._(LAST_WEEK), date, i18n.locale);
  if (days === -1) return dayjsFormat(i18n._(TOMORROW_AT), date, i18n.locale);
  if (days <= -2 && days >= -6) return dayjsFormat(i18n._(NEXT_WEEK), date, i18n.locale);
  return `${shortDate(date, i18n.locale)} ${clock(date, i18n.locale)}`;
}

/** Whether two messages fall on different days (date divider) */
export function differentDay(a: Date, b: Date) {
  return dayStart(a) !== dayStart(b);
}
