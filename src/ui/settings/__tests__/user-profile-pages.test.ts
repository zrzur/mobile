import { daysLeft, needsConsent, serviceReturnFields, steamReturnFields, toggleGame, toggleRepo } from "../user/connections-logic";
import { canRequest, contactOf, waitParts } from "../user/mydata-logic";
import {
  type OwnBadge,
  buildUserEdit,
  cleanStyle,
  earnable,
  endReason,
  heldBadges,
  humanSize,
  initialSections,
  isDirty,
  linkHost,
  linkProblem,
  memberEdit,
  moveSection,
  pastBadges,
  sectionsBody,
} from "../user/profile-logic";
import { byLastUsed, isAlreadyClosed, readLastUsed, relativeParts, sessionIcon, sessionTitle } from "../user/sessions-logic";

const original = { displayName: "Maya", pronouns: "she/her", bio: "Hello", style: { decoration: "laurel" } };

describe("profile save body", () => {
  it("is empty and clean when nothing changed", () => {
    const draft = { displayName: "Maya", pronouns: "she/her", bio: "Hello", style: { decoration: "laurel" } };
    expect(isDirty(original, draft)).toBe(false);
    expect(buildUserEdit(original, draft)).toEqual({});
  });

  it("removes cleared fields and sends new ones", () => {
    const draft = { displayName: "  ", pronouns: "they/them", bio: "", style: { decoration: "laurel" }, avatar: "file1", banner: null };
    expect(isDirty(original, draft)).toBe(true);
    expect(buildUserEdit(original, draft)).toEqual({ pronouns: "they/them", avatar: "file1", remove: ["DisplayName", "ProfileContent", "ProfileBackground"] });
  });

  it("sends the whole style when a look changed", () => {
    const draft = { ...original, style: { decoration: "ivy", name_colour: ["#ffffff"] } };
    expect(buildUserEdit(original, draft)).toEqual({ style: { decoration: "ivy", name_colour: ["#ffffff"] } });
  });

  it("drops bad colours, the default font and empty ids", () => {
    expect(cleanStyle({ theme: ["#zzzzzz", "#E0195F", "#000000", "#111111"], name_font: "default", decoration: "", effect: "snow" })).toEqual({ theme: ["#E0195F", "#000000"], effect: "snow" });
  });
});

describe("profile links", () => {
  it("needs https and a real site address", () => {
    expect(linkProblem("")).toBeUndefined();
    expect(linkProblem("http://a.com")).toBe("https");
    expect(linkProblem("https://localhost")).toBe("host");
    expect(linkProblem("https://example.com/x")).toBeUndefined();
    expect(linkHost("https://zrzur.com/legal?x=1")).toBe("zrzur.com");
    expect(linkHost("ftp://x")).toBeUndefined();
  });
});

describe("profile sections", () => {
  it("keeps the saved order, then hidden, then new ones; creators only get theirs", () => {
    const rows = initialSections(["links", "about"], ["games"], false);
    expect(rows.map((r) => `${r.id}:${r.shown}`)).toEqual(["links:true", "about:true", "games:false", "member_since:true", "connections:true"]);
    expect(initialSections(undefined, [], true)).toHaveLength(7);
  });

  it("moves rows and keeps unknown hidden ids", () => {
    const rows = moveSection(initialSections(["about", "links"], [], false), 0, 1);
    expect(rows[0].id).toBe("links");
    expect(moveSection(rows, 0, -1)).toBe(rows);
    const body = sectionsBody([{ id: "about", shown: true }, { id: "links", shown: false }], ["future_thing"]);
    expect(body).toEqual({ sections: ["about"], hidden_sections: ["links", "future_thing"] });
  });
});

describe("badges", () => {
  const now = 1_000_000;
  const grant = (badge: string, extra: Partial<OwnBadge> = {}): OwnBadge => ({ badge, source: "auto", granted_at: 1, hidden: false, ...extra });

  it("holds live grants, Feather and the early adopter bit, by priority", () => {
    const mine = { badges: [grant("bug_hunter"), grant("one_year", { expires_at: now - 1 }), grant("creator", { revoked_at: 5, revoke_reason: "no longer eligible" })], plus: true };
    const held = heldBadges(mine, 256, now);
    expect(held.map((h) => h.meta.id)).toEqual(["bug_hunter", "plus", "early_adopter"]);
    expect(earnable(held).some((b) => b.id === "founder" || b.id === "translator" || b.id === "plus")).toBe(false);
    const past = pastBadges(mine, now);
    expect(past.map((g) => endReason(g))).toEqual(["expired", "ineligible"]);
  });
});

describe("server identity", () => {
  it("removes cleared fields", () => {
    expect(memberEdit({ nickname: "M", pronouns: "" }, { nickname: "", pronouns: "they", avatar: null })).toEqual({ pronouns: "they", remove: ["Nickname", "Avatar"] });
    expect(memberEdit({ nickname: "M", pronouns: "" }, { nickname: "M ", pronouns: "" })).toEqual({});
  });

  it("writes sizes like the web", () => {
    expect(humanSize(8_000_000)).toBe("8 MB");
    expect(humanSize(2_500_000)).toBe("2.5 MB");
    expect(humanSize(500_000)).toBe("500 KB");
  });
});

describe("sessions", () => {
  it("sorts by last use, falling back to creation", () => {
    const last = readLastUsed([
      { _id: "a", last_seen: "2026-01-02T00:00:00Z" },
      { _id: "b", last_seen: "bad" },
      { _id: "c" },
    ]);
    expect(last.get("b")).toBeUndefined();
    const list = byLastUsed(
      [
        { id: "a", createdAt: 0 },
        { id: "b", createdAt: Date.parse("2026-03-01T00:00:00Z") },
        { id: "c", createdAt: 1 },
      ],
      last,
    );
    expect(list.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("picks icons, titles and units", () => {
    expect(sessionIcon("Zrzur on iOS")).toBe("device-mobile");
    expect(sessionIcon("Firefox on Windows")).toBe("desktop");
    expect(sessionIcon("")).toBe("question");
    expect(sessionTitle("android phone")).toBe("Android phone");
    expect(relativeParts(-3 * 3_600_000)).toEqual({ value: -3, unit: "hour" });
    expect(relativeParts(-10_000)).toEqual({ value: 0, unit: "minute" });
    expect(isAlreadyClosed({ type: "UnknownUser" })).toBe(true);
    expect(isAlreadyClosed(new Error("x"))).toBe(false);
  });
});

describe("connections", () => {
  it("reads the sign-in return", () => {
    const steam = steamReturnFields("https://app.zrzur.com/connections/steam/return?state=s1&openid.mode=id_res&openid.sig=x&other=1");
    expect(steam).toEqual({ state: "s1", params: { "openid.mode": "id_res", "openid.sig": "x" } });
    expect(serviceReturnFields("https://app.zrzur.com/connections/github/return?state=s2&code=c#x")).toEqual({ state: "s2", code: "c", denied: false });
    expect(serviceReturnFields("https://app.zrzur.com/connections/twitch/return?error=access_denied").denied).toBe(true);
  });

  it("keeps the small rules", () => {
    expect(daysLeft(86_400_000 * 2.5, 0)).toBe(3);
    expect(daysLeft(0, 5)).toBe(0);
    expect(toggleRepo([1, 2, 3, 4, 5, 6], 7, true)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(toggleRepo([1], 1, false)).toEqual([]);
    expect(toggleGame([10], 10, true)).toEqual([]);
    expect(toggleGame([], 10, false)).toEqual([10]);
    expect(needsConsent({ consent_current: false })).toBe(true);
    expect(needsConsent({})).toBe(false);
  });
});

describe("my data", () => {
  it("waits and asks", () => {
    expect(waitParts(3_661)).toEqual({ hours: 1, minutes: 2 });
    const info = { status: "none" as const, next_request_in_seconds: 0, deletion_grace_days: 30, contact_email: "" };
    expect(canRequest(info)).toBe(true);
    expect(canRequest({ ...info, status: "pending" })).toBe(false);
    expect(canRequest({ ...info, next_request_in_seconds: 5 })).toBe(false);
    expect(canRequest(undefined)).toBe(false);
    expect(contactOf(info)).toBe("privacy@zrzur.com");
    expect(contactOf({ contact_email: "a@b.c" })).toBe("a@b.c");
  });
});
