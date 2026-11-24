import { footerPadding, keyboardLift } from "../keyboardMath";

describe("footerPadding (a bottom bar riding on the keyboard)", () => {
  it("keyboard down: the bar clears the home indicator", () => {
    expect(footerPadding(0, 34, 0, 12)).toBe(46);
    expect(footerPadding(0, 0, 0, 12)).toBe(12);
  });

  it("keyboard up: the bar sits on the keyboard, the home indicator inset is inside the keyboard", () => {
    expect(footerPadding(336, 34, 0, 12)).toBe(348);
  });

  it("a container that already ends above the safe area only adds the rest", () => {
    expect(footerPadding(0, 34, 34, 12)).toBe(12);
    expect(footerPadding(336, 34, 34, 12)).toBe(314);
  });

  it("follows the keyboard continuously while it moves (interactive close)", () => {
    expect(footerPadding(20, 34, 0, 12)).toBe(46);
    expect(footerPadding(35, 34, 0, 12)).toBe(47);
  });
});

describe("keyboardLift (a screen ending above the keyboard)", () => {
  it("lifts by the part of the keyboard over the container's bottom", () => {
    expect(keyboardLift(0, 34)).toBe(0);
    expect(keyboardLift(336, 34)).toBe(302);
    expect(keyboardLift(336, 0)).toBe(336);
    expect(keyboardLift(10, 34)).toBe(0);
  });
});
