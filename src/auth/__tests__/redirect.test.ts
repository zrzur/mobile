import { needsRedirect, redirectReady } from "../redirect";

describe("root redirect", () => {
  it("waits until the navigator lists the target group", () => {
    expect(redirectReady(["index", "(auth)"], "(setup)")).toBe(false);
    expect(redirectReady(["index", "(setup)"], "(setup)")).toBe(true);
    expect(redirectReady([], "(app)")).toBe(false);
  });

  it("moves a person outside their group", () => {
    expect(needsRedirect(["(auth)", "login"], "(app)")).toBe(true);
    expect(needsRedirect(["(app)", "home"], "(app)")).toBe(false);
    expect(needsRedirect([], "(app)")).toBe(true);
  });

  it("moves setup to the step that is due", () => {
    expect(needsRedirect(["(setup)", "username"], "(setup)", "age")).toBe(true);
    expect(needsRedirect(["(setup)", "age"], "(setup)", "age")).toBe(false);
  });
});
