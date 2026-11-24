import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

import { i18n as appI18n } from "@/i18n/i18n";

import { type AuthError, toAuthError } from "./flow";

/** The web app's wording for each server error type (`i18n/errors.tsx`) */
const BY_TYPE = {
  InvalidCredentials: msg`Provided email or password is wrong.`,
  CaptchaFailed: msg`The security check didn't work. Please try again.`,
  UnverifiedAccount: msg`This account is not activated! Please check your account's inbox and try again.`,
  LockedOut: msg`You have been locked out for entering a wrong password multiple times. Please wait a couple minutes and try again.`,
  ShortPassword: msg`The password is too short.`,
  CompromisedPassword: msg`This password has previously appeared in security leaks, please use another password.`,
  InvalidSession: msg`Please log in again.`,
  NotAuthenticated: msg`Please log in again.`,
  InvalidToken: msg`This link has expired or was already used. Ask for a new one.`,
  EmailFailed: msg`The email couldn't be sent. Try again in a few minutes.`,
  MissingInvite: msg`You need an invite to sign up.`,
  InvalidInvite: msg`This invite has expired or doesn't exist.`,
  Blacklisted: msg`This email address can't be used.`,
  BlockedByShield: msg`This sign up is marked as spam.`,
  DisallowedMFAMethod: msg`This way of confirming isn't allowed here. Choose another one.`,
  UsernameTaken: msg`This username is already taken.`,
  InvalidUsername: msg`This username is not allowed.`,
  AlreadyOnboarded: msg`Your user has already been created? Try logging in again or refreshing the app.`,
  AgeRequirementNotMet: msg`Sorry, Zrzur is only for people aged 16 and older.`,
  AgeNotDeclared: msg`Add your month and year of birth to continue.`,
  AgeChangeNotAllowed: msg`Your age can't be changed this way. If it is wrong, write to privacy@zrzur.com.`,
  InternalError: msg`Something went wrong on our side. Try again in a moment.`,
  DatabaseError: msg`Something went wrong on our side. Try again in a moment.`,
  IncorrectData: msg`Something you entered isn't valid. Check it and try again.`,
  InvalidProperty: msg`Something you entered isn't valid. Check it and try again.`,
  OperationFailed: msg`That didn't work. Try again in a moment.`,
  Network: msg`Can't reach Zrzur. Check your connection.`,
  AlreadyInServer: msg`You're already part of this server.`,
  Banned: msg`You are banned from this server.`,
  MissingPermission: msg`You do not have permission to do this.`,
  MissingUserPermission: msg`You do not have permission to do this.`,
  NotElevated: msg`Your role ranking is too low to take this action.`,
  NotFound: msg`Could not find what you requested.`,
  CannotGiveMissingPermissions: msg`You cannot give yourself missing permissions.`,
} as const;

const FALLBACK = msg`Something went wrong. Try again in a moment.`;

/** The plain-words message for an error, in the current language */
export function errorText(i18n: I18n, error: AuthError): string {
  if (error.type === "FailedValidation") {
    const text = JSON.stringify(error.body).toLowerCase();
    if (text.includes("username")) {
      return i18n._(msg`Usernames take letters, digits and _ . - only, with no spaces or vowel marks.`);
    }
    return i18n._(BY_TYPE.IncorrectData);
  }
  // limits name their maximum (web: i18n/errors.tsx)
  const max = typeof error.body.max === "number" ? error.body.max : undefined;
  if (max !== undefined) {
    if (error.type === "TooManyServers") return i18n._(msg`You can't be in more than ${max} servers, please leave one and try again.`);
    if (error.type === "TooManyChannels") return i18n._(msg`You can't have more than ${max} channels on this server.`);
    if (error.type === "TooManyEmoji") return i18n._(msg`You can't have more than ${max} emojis on this server.`);
  }
  const known = BY_TYPE[error.type as keyof typeof BY_TYPE];
  if (known) return i18n._(known);
  if (error.code === "RateLimited" && error.retryAfter) {
    const seconds = Math.max(1, Math.ceil(error.retryAfter / 1000));
    return i18n._(
      msg`That was a lot at once. ${plural(seconds, { one: "Try again in # second.", other: "Try again in # seconds." })}`,
    );
  }
  return i18n._(FALLBACK);
}

/** The technical part shown under "Details": the server type and its message */
export function errorDetails(error: AuthError): string | undefined {
  if (error.type === "Unknown" && !error.technical) return undefined;
  const line = typeof error.body.error === "string" ? `\n${error.body.error}` : "";
  return error.type === "Unknown" || error.type === "Network"
    ? error.technical
    : `${error.type}${line}`;
}

/** Plain words for any failure from the API, in the current language */
export function describeError(err: unknown): string {
  return errorText(appI18n, toAuthError(err));
}
