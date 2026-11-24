import { i18n } from "@lingui/core";
import { Permission } from "@zrzur/sdk";

import { errorText } from "@/auth/errorText";
import { AuthError } from "@/auth/flow";

import { permissionGroups, stateOf, withState } from "../permissions";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

describe("role permissions", () => {
  it("reads allow, deny and inherit", () => {
    const allow = Permission.SendMessage;
    const deny = Permission.React;
    expect(stateOf("SendMessage", allow, deny)).toBe("allow");
    expect(stateOf("React", allow, deny)).toBe("deny");
    expect(stateOf("Speak", allow, deny)).toBe("inherit");
  });

  it("moves one bit between allow and deny without touching others", () => {
    const start: [bigint, bigint] = [Permission.SendMessage | Permission.Speak, Permission.React];
    const [a, d] = withState("SendMessage", "deny", ...start);
    expect(stateOf("SendMessage", a, d)).toBe("deny");
    expect(stateOf("Speak", a, d)).toBe("allow");
    expect(stateOf("React", a, d)).toBe("deny");
    const [a2, d2] = withState("React", "inherit", a, d);
    expect(stateOf("React", a2, d2)).toBe("inherit");
    expect(stateOf("SendMessage", a2, d2)).toBe("deny");
  });

  it("keeps bits above 32 (Administrator, soundboard)", () => {
    const [a] = withState("Administrator", "allow", 0n, 0n);
    expect(a).toBe(Permission.Administrator);
    expect(Number(a)).toBe(2 ** 46);
  });

  it("lists every permission once, in seven groups", () => {
    const groups = permissionGroups(i18n);
    expect(groups).toHaveLength(7);
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(Permission[key]).toBeDefined();
    expect(keys).toHaveLength(Object.keys(Permission).length - 1); // all but GrantAllSafe
  });
});

describe("server error wording", () => {
  const err = (type: string, body: Record<string, unknown> = {}) => new AuthError("Unknown" as never, "", { type, body: { type, ...body } });

  it("names the server limit", () => {
    expect(errorText(i18n, err("TooManyServers", { max: 100 }))).toBe("You can't be in more than 100 servers, please leave one and try again.");
  });

  it("uses the web words for permission errors", () => {
    expect(errorText(i18n, err("MissingPermission"))).toBe("You do not have permission to do this.");
    expect(errorText(i18n, err("NotElevated"))).toBe("Your role ranking is too low to take this action.");
  });
});
