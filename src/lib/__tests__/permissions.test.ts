import { Alert, Linking } from "react-native";

import { explainPermission, permissionOutcome } from "../permissions";

jest.mock("@/i18n/i18n", () => ({
  i18n: { _: (m: { message?: string; id?: string } | string) => (typeof m === "string" ? m : (m.message ?? m.id ?? "")) },
}));

describe("permission outcome", () => {
  it("tells granted, denied and blocked apart", () => {
    expect(permissionOutcome({ granted: true, canAskAgain: false })).toBe("granted");
    expect(permissionOutcome({ granted: false, canAskAgain: true })).toBe("denied");
    expect(permissionOutcome({ granted: false, canAskAgain: false })).toBe("blocked");
  });

  it("offers Open settings only when the system will not ask again", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined as never);
    explainPermission("camera-photo", "denied");
    expect(alert).not.toHaveBeenCalled();
    explainPermission("camera-photo", "blocked");
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons).toHaveLength(2);
    buttons[1].onPress!();
    expect(open).toHaveBeenCalled();
    // a call joined muted says so even after a plain "no"
    explainPermission("microphone-call", "denied");
    expect(alert.mock.calls[1][2]).toHaveLength(1);
  });
});
