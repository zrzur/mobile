/**
 * Server tickets settings (web: settings/server/TicketsSettings.tsx), the
 * pure part: the draft, its checks and the body `PATCH /servers/{id}` takes.
 * The SDK on the phone (2.0.0) does not carry `Server.tickets` yet, so the
 * page reads the server's own answer and sends the field itself.
 */

export type TicketType = { id: string; name: string; staff_roles: string[] };

export type TicketsSettings = {
  enabled?: boolean;
  category?: string | null;
  staff_roles?: string[] | null;
  message?: string | null;
  label?: string | null;
  types?: { id: string; name: string; staff_roles?: string[] | null }[] | null;
};

export type TicketsDraft = {
  category: string;
  staff_roles: string[];
  message: string;
  label: string;
  types: TicketType[];
};

/** At most five kinds of ticket, and ten roles per list (web and server) */
export const MAX_TYPES = 5;
export const MAX_ROLES = 10;

export function draftOf(tickets: TicketsSettings | undefined | null): TicketsDraft {
  return {
    category: tickets?.category ?? "",
    staff_roles: [...(tickets?.staff_roles ?? [])],
    message: tickets?.message ?? "",
    label: tickets?.label ?? "",
    types: (tickets?.types ?? []).map((type) => ({ id: type.id, name: type.name, staff_roles: [...(type.staff_roles ?? [])] })),
  };
}

export function sameDraft(a: TicketsDraft, b: TicketsDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every kind needs a name before saving */
export function typesReady(draft: TicketsDraft): boolean {
  return draft.types.every((type) => type.name.trim().length > 0);
}

/** Add or remove a role; a full list stays as it is */
export function toggleRole(list: string[], id: string): string[] {
  if (list.includes(id)) return list.filter((role) => role !== id);
  return list.length < MAX_ROLES ? [...list, id] : list;
}

/** A new kind's id (the server keeps it; unique within the server) */
export function newTypeId(now = Date.now(), random = Math.random()): string {
  return now.toString(36) + random.toString(36).slice(2, 8);
}

/** The `tickets` field of `PATCH /servers/{id}` */
export function ticketsBody(enabled: boolean, draft: TicketsDraft) {
  return {
    enabled,
    category: draft.category || undefined,
    staff_roles: draft.staff_roles,
    message: draft.message.trim() || undefined,
    label: draft.label.trim() || undefined,
    types: draft.types.map((type) => ({ ...type, name: type.name.trim() })),
  };
}
