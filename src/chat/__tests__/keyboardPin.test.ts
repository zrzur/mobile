import { keyboardShowEvent } from "../keyboardPin";

it("follows the keyboard before it moves on iOS, after it moved on Android", () => {
  expect(keyboardShowEvent("ios")).toBe("keyboardWillShow");
  expect(keyboardShowEvent("android")).toBe("keyboardDidShow");
});
