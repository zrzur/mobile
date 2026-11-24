import { gateState, hasInterests, interestsKey, matureAccess, shouldAskInterests, toBirthMonth } from "../onboardingLogic";

describe("interests window", () => {
  const questions = [{ options: [{ role: "r1" }, { role: "r2" }] }];
  it("asks a member who holds none of the answer roles", () => {
    expect(shouldAskInterests(questions, ["other"], false)).toBe(true);
  });
  it("does not ask once a role is held, when skipped, or without questions", () => {
    expect(shouldAskInterests(questions, ["r2"], false)).toBe(false);
    expect(shouldAskInterests(questions, [], true)).toBe(false);
    expect(shouldAskInterests([], [], false)).toBe(false);
    expect(shouldAskInterests([{ options: [] }], [], false)).toBe(false);
    expect(shouldAskInterests(undefined, [], false)).toBe(false);
  });
  it("offers the menu row only with answers", () => {
    expect(hasInterests(questions)).toBe(true);
    expect(hasInterests([{ options: [] }])).toBe(false);
  });
  it("uses a storage key SecureStore accepts", () => {
    expect(interestsKey("01S", "01U")).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("age gate", () => {
  it("reads the server's answer, unknown otherwise", () => {
    expect(matureAccess({ mature_access: "allowed" })).toBe("allowed");
    expect(matureAccess({ mature_access: "minor" })).toBe("minor");
    expect(matureAccess(null)).toBe("age_unknown");
    expect(matureAccess({ mature_access: "weird" })).toBe("age_unknown");
  });
  it("opens non-mature content, explains a closed one, asks once otherwise", () => {
    expect(gateState(false, "minor", false)).toBe("open");
    expect(gateState(true, "minor", false)).toBe("minor");
    expect(gateState(true, "verification_required", true)).toBe("verification_required");
    expect(gateState(true, "allowed", false)).toBe("notice");
    expect(gateState(true, "allowed", true)).toBe("open");
  });
  it("formats the birth month", () => {
    expect(toBirthMonth(2001, 3)).toBe("2001-03");
  });
});
