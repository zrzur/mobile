import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** Below 16 by the month (web: born on or after this month sixteen years ago) */
export function isUnderMinimumAge(year: number, month: number, today = new Date()): boolean {
  const born = year * 12 + (month - 1);
  const limit = today.getFullYear() * 12 + today.getMonth() - 16 * 12;
  return born >= limit;
}

/** The web field's checks and wording */
export function checkBirth(
  i18n: I18n,
  month: number | undefined,
  year: string,
  today = new Date(),
): string | undefined {
  if (!month) return i18n._(msg`Please fill in this field.`);
  if (!/^\d{4}$/.test(year)) return i18n._(msg`Enter the year with 4 digits, for example 1994.`);
  const born = Number(year) * 12 + (month - 1);
  const now = today.getFullYear() * 12 + today.getMonth();
  if (born > now || now - born > 120 * 12) return i18n._(msg`Check the month and year of birth.`);
  return undefined;
}
