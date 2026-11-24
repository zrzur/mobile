import { i18n } from "@lingui/core";

import { yearDigits } from "@/ui/auth/BirthMonthField";
import { SKY_H, SKY_W, skyFlock, skyLayers, skyScattered } from "@/ui/auth/flock";

import { checkBirth, isUnderMinimumAge } from "../age";
import { errorDetails, errorText } from "../errorText";
import { AuthError } from "../flow";
import { mapMailProvider } from "../mailProvider";
import { checkConsent, checkEmail, checkLength, required } from "../validate";

beforeAll(() => {
  // source language: the messages are their own ids
  i18n.load("en", {});
  i18n.activate("en");
});

const err = (type: string, extra: Partial<{ body: Record<string, unknown>; retryAfter: number; code: string }> = {}) =>
  new AuthError((extra.code ?? "Unknown") as never, type, { type, body: extra.body, retryAfter: extra.retryAfter });

describe("server errors use the web app's words", () => {
  it.each([
    ["InvalidCredentials", "Provided email or password is wrong."],
    ["CaptchaFailed", "The security check didn't work. Please try again."],
    ["UnverifiedAccount", "This account is not activated! Please check your account's inbox and try again."],
    ["InvalidToken", "This link has expired or was already used. Ask for a new one."],
    ["UsernameTaken", "This username is already taken."],
    ["AgeRequirementNotMet", "Sorry, Zrzur is only for people aged 16 and older."],
    ["Network", "Can't reach Zrzur. Check your connection."],
    ["SomethingNew", "Something went wrong. Try again in a moment."],
  ])("%s", (type, text) => {
    expect(errorText(i18n, err(type))).toBe(text);
  });

  it("names the username rule for a username that fails validation", () => {
    expect(errorText(i18n, err("FailedValidation", { body: { error: "username: format" } }))).toBe(
      "Usernames take letters, digits and _ . - only, with no spaces or vowel marks.",
    );
  });

  it("counts down a rate limit in seconds", () => {
    expect(errorText(i18n, err("Unknown", { code: "RateLimited", retryAfter: 1500 }))).toBe(
      "That was a lot at once. Try again in 2 seconds.",
    );
    expect(errorText(i18n, err("Unknown", { code: "RateLimited", retryAfter: 900 }))).toBe(
      "That was a lot at once. Try again in 1 second.",
    );
  });

  it("puts the server type under Details", () => {
    expect(errorDetails(err("InvalidCredentials"))).toBe("InvalidCredentials");
    expect(errorDetails(err("Blacklisted", { body: { error: "domain" } }))).toBe("Blacklisted\ndomain");
  });
});

describe("form checks", () => {
  it("asks for empty fields, a valid email, enough characters and the terms box", () => {
    expect(required(i18n, " ")).toBe("Please fill in this field.");
    expect(checkEmail(i18n, "sara@")).toBe("Enter a valid email address.");
    expect(checkEmail(i18n, "sara@example.com")).toBeUndefined();
    expect(checkLength(i18n, "short", 10)).toBe("Use at least 10 characters.");
    expect(checkLength(i18n, "long enough!", 10)).toBeUndefined();
    expect(checkConsent(i18n, false)).toBe("Tick the box to accept before you continue.");
    expect(checkConsent(i18n, true)).toBeUndefined();
  });
});

describe("month and year of birth", () => {
  const today = new Date(2026, 10, 22); // November 2026

  it("is under 16 from this month sixteen years ago", () => {
    expect(isUnderMinimumAge(2010, 11, today)).toBe(true);
    expect(isUnderMinimumAge(2010, 10, today)).toBe(false);
    expect(isUnderMinimumAge(1994, 1, today)).toBe(false);
  });

  it("checks the month, four digits and a sensible date", () => {
    expect(checkBirth(i18n, undefined, "1994", today)).toBe("Please fill in this field.");
    expect(checkBirth(i18n, 3, "94", today)).toBe("Enter the year with 4 digits, for example 1994.");
    expect(checkBirth(i18n, 12, "2026", today)).toBe("Check the month and year of birth.");
    expect(checkBirth(i18n, 1, "1900", today)).toBe("Check the month and year of birth.");
    expect(checkBirth(i18n, 3, "1994", today)).toBeUndefined();
  });

  it("reads Arabic-Indic and Persian digits", () => {
    expect(yearDigits("١٩٩٤")).toBe("1994");
    expect(yearDigits("۲۰۰۱")).toBe("2001");
    expect(yearDigits("19a9-4x7")).toBe("1994");
  });
});

describe("mail provider button", () => {
  it.each([
    ["sara@gmail.com", ["Gmail", "https://gmail.com"]],
    ["sara@hotmail.com", ["Outlook", "https://outlook.live.com"]],
    ["sara@pm.me", ["ProtonMail", "https://mail.protonmail.com"]],
    ["sara@example.org", ["example.org", "https://example.org"]],
  ])("%s", (email, provider) => {
    expect(mapMailProvider(email)).toEqual(provider);
  });

  it("has no button without an address", () => {
    expect(mapMailProvider(null)).toBeUndefined();
    expect(mapMailProvider("no-at-sign")).toBeUndefined();
  });
});

describe("the sky of birds", () => {
  it("draws the same 200 birds every time, inside the sky", () => {
    const a = skyFlock();
    const b = skyFlock();
    expect(a).toHaveLength(200);
    expect(a).toEqual(b);
    for (const bird of a) {
      expect(bird.x).toBeGreaterThanOrEqual(8);
      expect(bird.x).toBeLessThanOrEqual(SKY_W - 8);
      expect(bird.y).toBeGreaterThanOrEqual(8);
      expect(bird.y).toBeLessThanOrEqual(SKY_H - 8);
      expect(bird.o).toBeGreaterThanOrEqual(0.3);
      expect(bird.o).toBeLessThanOrEqual(0.9);
    }
  });

  it("groups the birds into the web's four strengths", () => {
    const layers = skyLayers(skyFlock()).map((l) => l.opacity).sort();
    expect(layers.every((o) => [0.4, 0.6, 0.8, 1].includes(o))).toBe(true);
    expect(skyScattered()).toHaveLength(200);
  });
});
