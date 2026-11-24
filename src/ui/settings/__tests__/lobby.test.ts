import {
  clampStep,
  contrast,
  DEFAULT_SECTIONS,
  draftOf,
  eligibleRoles,
  inkOn,
  isOrdinary,
  lobbyBody,
  lobbyProblem,
  lobbyWithQuestions,
  move,
  type QuestionRole,
  questionsOf,
  questionsProblem,
  sameDraft,
  sameQuestions,
  toggleIn,
  withEnabled,
} from "../lobby";

describe("lobby draft and save body", () => {
  it("starts an empty lobby with every section on in the default order", () => {
    const d = draftOf(undefined);
    expect(d.enabled).toBe(false);
    expect(d.sections.map((s) => s.id)).toEqual(DEFAULT_SECTIONS);
    expect(d.sections.every((s) => s.on)).toBe(true);
    expect(lobbyBody(d).sections).toEqual([]);
    expect(lobbyBody(d).hide_sections).toBe(false);
  });

  it("puts chosen sections first and hidden ones after, off", () => {
    const d = draftOf({ sections: ["Team", "About"] });
    expect(d.sections.slice(0, 2)).toEqual([
      { id: "Team", on: true },
      { id: "About", on: true },
    ]);
    expect(d.sections.slice(2).every((s) => !s.on)).toBe(true);
    expect(lobbyBody(d).sections).toEqual(["Team", "About"]);
  });

  it("stores no section on as hide_sections", () => {
    const d = draftOf({ hide_sections: true });
    expect(d.sections.every((s) => !s.on)).toBe(true);
    const body = lobbyBody(d);
    expect(body.hide_sections).toBe(true);
    expect(body.sections).toEqual([]);
  });

  it("trims text, drops empty optional values and keeps onboarding from the server", () => {
    const stored = { onboarding: [{ id: "q", question: "Q", options: [{ id: "o", label: "A", role: "r" }] }] };
    const d = { ...draftOf(stored), tagline: "  hi  ", about: "   ", accent: "", news_channel: "", intro_channel: "c1" };
    d.actions = [
      { label: " Say hi ", channel: "c1" },
      { label: "", channel: "c2" },
    ];
    d.faq = [
      { question: "How?", answer: "Like this" },
      { question: "", answer: "x" },
    ];
    const body = lobbyBody(d, stored);
    expect(body.tagline).toBe("hi");
    expect(body.about).toBeUndefined();
    expect(body.accent).toBeUndefined();
    expect(body.news_channel).toBeUndefined();
    expect(body.intro_channel).toBe("c1");
    expect(body.actions).toEqual([{ label: "Say hi", channel: "c1" }]);
    expect(body.faq).toEqual([{ question: "How?", answer: "Like this" }]);
    expect(body.onboarding).toEqual(stored.onboarding);
    expect(body.onboarding).not.toBe(stored.onboarding);
  });

  it("is not dirty right after loading and dirty after an edit", () => {
    const stored = { accent: "#E0195F", appearance: { blend: 40 } };
    expect(sameDraft(draftOf(stored), draftOf(stored))).toBe(true);
    expect(sameDraft({ ...draftOf(stored), tagline: "x" }, draftOf(stored))).toBe(false);
  });

  it("flips only enabled for the auto-save toggle", () => {
    const stored = { enabled: false, tagline: "t", appearance: { radius: 4 } };
    expect(withEnabled(stored, true)).toEqual({ ...stored, enabled: true });
    expect(withEnabled(undefined, true)).toEqual({ enabled: true });
  });
});

describe("lobby validation", () => {
  const base = draftOf(undefined);

  it("accepts an empty draft", () => {
    expect(lobbyProblem(base)).toBeUndefined();
  });

  it("needs six-digit colours", () => {
    expect(lobbyProblem({ ...base, accent: "#E01" })).toBe("colour");
    expect(lobbyProblem({ ...base, appearance: { surface: "red" } })).toBe("colour");
    expect(lobbyProblem({ ...base, accent: "#e0195f" })).toBeUndefined();
  });

  it("needs 4.5:1 text contrast on background and cards", () => {
    expect(lobbyProblem({ ...base, appearance: { background: "#1D1F2D", text: "#2A2C3A" } })).toBe("contrast");
    expect(lobbyProblem({ ...base, appearance: { background: "#1D1F2D", text: "#F0F1F8" } })).toBeUndefined();
    // automatic ink on the background against a pale card
    expect(lobbyProblem({ ...base, appearance: { background: "#101116", surface: "#F0F1F8" } })).toBe("contrast");
    // a surface alone with no text colour is not checked
    expect(lobbyProblem({ ...base, appearance: { surface: "#F0F1F8" } })).toBeUndefined();
  });

  it("needs complete buttons, then complete questions", () => {
    expect(lobbyProblem({ ...base, actions: [{ label: " ", channel: "c" }] })).toBe("buttons");
    expect(lobbyProblem({ ...base, actions: [{ label: "Hi", channel: "" }] })).toBe("buttons");
    expect(lobbyProblem({ ...base, faq: [{ question: "Q", answer: " " }] })).toBe("faq");
  });

  it("computes WCAG contrast and ink", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(inkOn("#101116")).toBe("#FFFFFF");
    expect(inkOn("#F3B96B")).toBe("#101116");
  });
});

describe("list helpers", () => {
  it("moves items up and down and ignores moves past the ends", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    const list = [1, 2, 3];
    expect(move(list, 0, -1)).toBe(list);
    expect(move(list, 2, 3)).toBe(list);
  });

  it("toggles picks up to a maximum, keeping order", () => {
    expect(toggleIn(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a", 2)).toEqual(["b"]);
  });

  it("clamps stepper values", () => {
    expect(clampStep(105, 0, 100)).toBe(100);
    expect(clampStep(-5, 0, 100)).toBe(0);
    expect(clampStep(27.6, 0, 100)).toBe(28);
  });
});

describe("welcome questions", () => {
  const role = (id: string, rank: number, extra: Partial<QuestionRole> = {}): QuestionRole => ({ id, name: id, rank, managed: false, ordinary: true, ...extra });

  it("treats only public bits as ordinary", () => {
    expect(isOrdinary(0n)).toBe(true);
    expect(isOrdinary((1n << 20n) | (1n << 41n))).toBe(true);
    expect(isOrdinary(1n << 2n)).toBe(false);
  });

  it("offers ordinary unmanaged roles below the user; the owner gets all of those", () => {
    const roles = [role("mod", 0, { ordinary: false }), role("high", 1), role("bot", 5, { managed: true }), role("low", 3)];
    expect(eligibleRoles(roles, false, 1).map((r) => r.id)).toEqual(["low"]);
    expect(eligibleRoles(roles, true, Infinity).map((r) => r.id)).toEqual(["high", "low"]);
  });

  it("finds empty questions, labels and missing or unknown roles", () => {
    const list = [
      { id: "q1", question: " ", options: [{ id: "o1", label: "", role: "" }] },
      { id: "q2", question: "Ok", options: [{ id: "o2", label: "A", role: "gone" }] },
    ];
    const r = questionsProblem(list, new Set(["r1"]));
    expect(r.invalid).toBe(true);
    expect(r.errors.question).toEqual({ q1: true });
    expect(r.errors.label).toEqual({ o1: true });
    expect(r.errors.role).toEqual({ o1: true, o2: true });
    expect(questionsProblem([{ id: "q", question: "Q", options: [] }], new Set()).invalid).toBe(true);
    expect(questionsProblem([{ id: "q", question: "Q", options: [{ id: "o", label: "A", role: "r1" }] }], new Set(["r1"])).invalid).toBe(false);
  });

  it("saves trimmed questions into the current lobby", () => {
    const stored = { tagline: "t", onboarding: [] };
    const body = lobbyWithQuestions(stored, [{ id: "q", question: " Q ", description: "  ", options: [{ id: "o", label: " A ", role: "r" }] }]);
    expect(body.enabled).toBe(false);
    expect(body.tagline).toBe("t");
    expect(body.onboarding).toEqual([{ id: "q", question: "Q", description: undefined, options: [{ id: "o", label: "A", role: "r" }] }]);
  });

  it("compares ignoring null vs missing descriptions", () => {
    const a = questionsOf([{ id: "q", question: "Q", options: [] }]);
    const b = questionsOf([{ id: "q", question: "Q", description: null as never, options: [] }]);
    expect(sameQuestions(a, b)).toBe(true);
  });
});
