/**
 * Ready-made starts for a new server (web: modal/lib/serverTemplates.ts).
 * Pure: the create flow localises the names, then sends the whole server as
 * one blueprint, so it comes back complete or not at all.
 *
 * Only the templates the web offers on its create screen are here (Start
 * from scratch, Gaming community, Friends); the web's hidden ones are not
 * shown anywhere yet.
 */

export type ServerTemplateId = "custom" | "gaming" | "friends";
export type TemplateRoom = { key: string; name: string; type: "Text" | "Voice" };
/**
 * A role a template creates. Its powers are listed bit by bit, never guessed
 * from the name, and never include server-wide control: the owner keeps those.
 */
export type TemplateRole = {
  key: string;
  name: string;
  colour: string;
  allow: number;
  /** false: not its own group in the member list (default true) */
  hoist?: boolean;
  /** false: no voice in the read-only rooms (default true) */
  posts?: boolean;
};
/** The answer to "Who will gather here?"; skip is "Decide later" */
export type ServerAnswer = "community" | "friends" | "skip";
export type ServerTemplate = {
  id: ServerTemplateId;
  /** no categories: the rooms sit under the server's own headings */
  flat?: boolean;
  groups: { key: string; name: string; rooms: TemplateRoom[] }[];
  roles?: TemplateRole[];
  /** rooms everyone reads; only roles without `posts: false` write there */
  readOnly?: string[];
  /** room set as the server's rules channel */
  rules?: string;
};

/** Permission bits (the server's numbers): manage messages, timeout, kick, assign roles */
export const PERMISSION = {
  KickMembers: 2 ** 6,
  TimeoutMembers: 2 ** 8,
  AssignRoles: 2 ** 9,
  ManageMessages: 2 ** 23,
} as const;

const text = (key: string, name = key): TemplateRoom => ({ key, name, type: "Text" });
const voice = (key: string, name: string): TemplateRoom => ({ key, name, type: "Voice" });

const moderators: TemplateRole = {
  key: "moderators",
  name: "Moderators",
  colour: "#8b5cf6",
  allow: PERMISSION.ManageMessages + PERMISSION.TimeoutMembers + PERMISSION.KickMembers + PERMISSION.AssignRoles,
};
const members: TemplateRole = { key: "members", name: "Members", colour: "#93c5fd", allow: 0, hoist: false, posts: false };
const startHere = { key: "start", name: "Start here", rooms: [text("rules"), text("announcements")] };
/** The rooms everyone reads, and the one shown as the server's rules */
const staffed = { readOnly: ["rules", "announcements"], rules: "rules" };

export const serverTemplates: readonly ServerTemplate[] = [
  { id: "custom", groups: [] },
  {
    id: "gaming",
    groups: [
      startHere,
      { key: "chat", name: "Community", rooms: [text("general", "General"), text("clips")] },
      { key: "voice", name: "Gaming rooms", rooms: [voice("lobby", "Lobby"), voice("squad", "Squad")] },
    ],
    roles: [moderators, members],
    ...staffed,
  },
  {
    id: "friends",
    groups: [
      { key: "chat", name: "Friends", rooms: [text("general", "General"), text("photos")] },
      { key: "voice", name: "Hang out", rooms: [voice("hangout", "Hangout")] },
    ],
  },
];

export const getServerTemplate = (id: ServerTemplateId = "custom") => serverTemplates.find((template) => template.id === id) ?? serverTemplates[0];

/** The templates offered under "Or start ready-made" (Start from scratch has its own row) */
export const pickableServerTemplates = () => serverTemplates.filter((template) => template.id !== "custom");

/** Start from scratch: the answer alone decides what is in it */
function scratchTemplate(answer: ServerAnswer): ServerTemplate {
  const general = text("general", "General");
  return answer === "community"
    ? {
        id: "custom",
        groups: [startHere, { key: "chat", name: "Community", rooms: [general] }, { key: "voice", name: "Hang out", rooms: [voice("lobby", "Lobby")] }],
        roles: [moderators, members],
        ...staffed,
      }
    : { id: "custom", flat: true, groups: [{ key: "rooms", name: "", rooms: [general, voice("hangout", "Hangout")] }] };
}

/** What a choice on the screen really builds: the template, cut to the answer */
export function tailorServerTemplate(id: ServerTemplateId, answer: ServerAnswer): ServerTemplate {
  if (id === "custom") return scratchTemplate(answer);
  const template = getServerTemplate(id);
  if (id === "gaming" && answer === "friends") return { id, groups: template.groups.filter((group) => group !== startHere) };
  if (id === "friends" && answer === "community") return { ...template, groups: [startHere, ...template.groups], roles: [moderators], ...staffed };
  return template;
}

/** The room a new server opens on: the first text room a member can write in */
export function openingRoom(template: ServerTemplate): string | undefined {
  const rooms = template.groups.flatMap((group) => group.rooms).filter((room) => room.type === "Text");
  const open = rooms.find((room) => !template.readOnly?.includes(room.key));
  return (open ?? rooms[0])?.key;
}

/** The id of that room on a server made from the template (else its first channel) */
export function openingChannel(template: ServerTemplate, channels: readonly { id: string; name: string }[]): string | undefined {
  const key = openingRoom(template);
  const room = template.groups.flatMap((group) => group.rooms).find((entry) => entry.key === key);
  return (channels.find((c) => c.name === room?.name) ?? channels[0])?.id;
}

/** Names in the person's language; anything without one stays as it is */
export function localiseTemplate(template: ServerTemplate, names: Record<string, string>): ServerTemplate {
  const name = (value: string) => names[value] ?? value;
  return {
    ...template,
    groups: template.groups.map((group) => ({ ...group, name: name(group.name), rooms: group.rooms.map((room) => ({ ...room, name: name(room.name) })) })),
    roles: template.roles?.map((role) => ({ ...role, name: name(role.name) })),
  };
}

/** The blueprint `POST /servers/create` takes (web: serverBlueprint) */
export function serverBlueprint(template: ServerTemplate, icon?: string) {
  const channel = (room: TemplateRoom) => ({
    name: room.name,
    type: room.type,
    read_only: template.readOnly?.includes(room.key) ?? false,
    rules: template.rules === room.key,
  });
  return {
    ...(icon ? { icon } : {}),
    channels: template.flat ? template.groups.flatMap((group) => group.rooms.map(channel)) : [],
    categories: template.flat ? [] : template.groups.map((group) => ({ title: group.name, channels: group.rooms.map(channel) })),
    roles: (template.roles ?? []).map((role) => ({
      name: role.name,
      colour: role.colour,
      hoist: role.hoist ?? true,
      allow: role.allow,
      posts_in_read_only: role.posts ?? true,
    })),
  };
}

/** The longest server name */
export const NAME_LIMIT = 32;

/** Cut to at most `limit` UTF-16 units without splitting a character (web: clip) */
export function clip(text: string, limit: number): string {
  let out = "";
  for (const character of text) {
    if (out.length + character.length > limit) break;
    out += character;
  }
  return out;
}

/**
 * The name the field starts with: "{name}'s server" made from the person's
 * own name, cut so the whole stays within the limit. `own` builds the
 * sentence in the person's language.
 */
export function defaultServerName(displayName: string, own: (name: string) => string, limit = NAME_LIMIT): string {
  const room = Math.max(0, limit - own("").length);
  return own(clip(displayName, room).trim()).trim();
}

/** A write that got no answer in time; it may still land on the server */
export class TemplateTimeout extends Error {
  constructor() {
    super("The server did not answer in time");
    this.name = "TemplateTimeout";
  }
}

/** Run `operation`, failing with TemplateTimeout after `ms` */
export async function withTimeout<T>(operation: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TemplateTimeout()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The server a timed-out create made after all: one of ours that came in
 * since. A retry opens it instead of making a second one.
 */
export function landedServer<T extends { id: string; ownerId?: string }>(servers: readonly T[], selfId: string | undefined, known: ReadonlySet<string>): T | undefined {
  return servers.find((server) => server.ownerId === selfId && !known.has(server.id));
}

/** The steps of the create-or-join page */
export type FlowStep = "start" | "audience" | "yours" | "join" | "invite";

/** The step Back goes to (undefined: Back closes the page) */
export function previousStep(step: FlowStep): FlowStep | undefined {
  switch (step) {
    case "audience":
    case "join":
      return "start";
    case "yours":
      return "audience";
    case "invite":
      return "join";
    default:
      return undefined;
  }
}
