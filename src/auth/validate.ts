import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** The web form's own checks, with its wording */
export function required(i18n: I18n, value: string): string | undefined {
  return value.trim() ? undefined : i18n._(msg`Please fill in this field.`);
}

export function checkEmail(i18n: I18n, value: string): string | undefined {
  return (
    required(i18n, value) ??
    (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined : i18n._(msg`Enter a valid email address.`))
  );
}

export function checkLength(i18n: I18n, value: string, minimum: number): string | undefined {
  return (
    required(i18n, value) ??
    (value.length >= minimum ? undefined : i18n._(msg`Use at least ${minimum} characters.`))
  );
}

export function checkConsent(i18n: I18n, accepted: boolean): string | undefined {
  return accepted ? undefined : i18n._(msg`Tick the box to accept before you continue.`);
}
