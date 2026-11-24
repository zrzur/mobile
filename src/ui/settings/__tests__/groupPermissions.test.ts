import { i18n } from "@lingui/core";
import { DEFAULT_PERMISSION_DIRECT_MESSAGE } from "@zrzur/sdk";

import { groupPermissionGroups, groupValue, variantGroups } from "../overrides";
import { permissionGroups } from "../permissions";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

const keys = (g: ReturnType<typeof variantGroups>) => g.flatMap((x) => x.items.map((i) => i.key));
const text = (g: ReturnType<typeof variantGroups>, key: string) => g.flatMap((x) => x.items).find((i) => i.key === key)?.text;

describe("group permissions (web ChannelPermissionsEditor, type group)", () => {
  it("lists only the rights a group has, in the web order", () => {
    expect(keys(groupPermissionGroups(i18n, permissionGroups(i18n)))).toEqual([
      "ManageChannel",
      "ManagePermissions",
      "SendMessage",
      "ManageMessages",
      "ManageWebhooks",
      "InviteOthers",
      "SendEmbeds",
      "UploadFiles",
      "Masquerade",
      "React",
      "UseExternalEmojis",
      "MentionEveryone",
      "MentionRoles",
    ]);
  });

  it("keeps the web headings and drops the empty ones", () => {
    expect(groupPermissionGroups(i18n, permissionGroups(i18n)).map((g) => g.title)).toEqual(["Admin", "Channels", "Messaging", "Mentions"]);
  });

  it("uses the group wording", () => {
    const g = variantGroups(i18n, permissionGroups(i18n), "group");
    expect(text(g, "ManageChannel")).toBe("Edit group name and description");
    expect(text(g, "ManagePermissions")).toBe("Whether other users can edit these settings");
    expect(text(g, "InviteOthers")).toBe("Add new members to the group");
    expect(keys(g)).not.toContain("Administrator");
    expect(keys(g)).not.toContain("ViewChannel");
  });

  it("reads a group's value, or the direct-message default when it has none", () => {
    expect(groupValue(undefined, DEFAULT_PERMISSION_DIRECT_MESSAGE)).toBe(DEFAULT_PERMISSION_DIRECT_MESSAGE);
    expect(groupValue(null, 5n)).toBe(5n);
    expect(groupValue(12, 5n)).toBe(12n);
    expect(groupValue(0n, 5n)).toBe(0n);
  });
});
