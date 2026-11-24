/**
 * Tickets: a private channel between a member and the ticket staff of a
 * server (web: interface/tickets, modals OpenTicket and CloseTicket, the
 * server menu's "Open a ticket"). The installed SDK does not keep the ticket
 * fields yet, so the raw API objects are read here.
 */

/** A channel's ticket state (API TicketInformation) */
export type TicketInfo = { opener: string; number: number; closed: boolean; kind?: string; claimedBy?: string };

/** A kind of ticket a member chooses from (API TicketType) */
export type TicketKind = { id: string; name: string };

/** A server's ticket settings, as far as members need them (API ServerTickets) */
export type ServerTickets = { enabled: boolean; label?: string; types: TicketKind[] };

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/** The ticket state of a raw channel, or undefined when it is not a ticket */
export function readTicket(channel: unknown): TicketInfo | undefined {
  const raw = record(record(channel).ticket);
  if (typeof raw.opener !== "string") return undefined;
  return {
    opener: raw.opener,
    number: typeof raw.number === "number" ? raw.number : 0,
    closed: raw.closed === true,
    kind: text(raw.kind),
    claimedBy: text(raw.claimed_by),
  };
}

/** The ticket settings of a raw server */
export function readServerTickets(server: unknown): ServerTickets {
  const raw = record(record(server).tickets);
  const types: TicketKind[] = [];
  for (const entry of Array.isArray(raw.types) ? raw.types : []) {
    const e = record(entry);
    if (typeof e.id === "string" && typeof e.name === "string") types.push({ id: e.id, name: e.name });
  }
  return { enabled: raw.enabled === true, label: text(raw.label), types };
}

export type TicketAction = "claim" | "unclaim" | "save" | "close" | "reopen" | "delete";

/**
 * Which actions a person has on a ticket (web: TicketMenuItems):
 * open: Take ticket / Give back for the staff, Save the conversation, Close
 * ticket; closed (only the staff still see it): Save, Reopen, and Delete for
 * those who manage channels.
 */
export function ticketActions(ticket: TicketInfo, me: string | undefined, manageChannels: boolean): TicketAction[] {
  const out: TicketAction[] = [];
  const mine = ticket.opener === me;
  if (!ticket.closed && !mine) out.push(ticket.claimedBy === me ? "unclaim" : "claim");
  out.push("save");
  if (!ticket.closed) out.push("close");
  else {
    out.push("reopen");
    if (manageChannels) out.push("delete");
  }
  return out;
}

/** One kind already chosen when there is only one (web: OpenTicket) */
export const initialKind = (types: TicketKind[]) => (types.length === 1 ? types[0].id : undefined);

/** One line of a saved conversation (web: transcriptLine) */
export function transcriptLine(at: Date, author: string, content: string, attachments: number): string {
  const time = at.toISOString().replace("T", " ").slice(0, 16);
  const files = attachments ? ` [${attachments} file(s)]` : "";
  return `[${time}] ${author}: ${content.replace(/\r?\n/g, "\n    ")}${files}`;
}

/** The whole saved conversation: name (kind), description, a blank line, then the lines oldest first */
export function transcriptText(name: string, kind: string | undefined, description: string | undefined, newestFirst: string[]): string {
  const head = [`${name}${kind ? ` (${kind})` : ""}`, description ?? "", ""].filter((line, index) => line || index === 2);
  return [...head, ...[...newestFirst].reverse()].join("\n") + "\n";
}

/** A file name for the saved conversation */
export const transcriptFile = (channelName: string) => `${(channelName || "ticket").replace(/[\\/:*?"<>|]+/g, "-")}.txt`;
