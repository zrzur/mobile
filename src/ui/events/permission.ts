import type { Server } from "@zrzur/sdk/solid";

/** Manage Events (web SDK beta: 2^49); the installed SDK does not name it yet */
const MANAGE_EVENTS = 1n << 49n;

/** Whether you may plan and run the events of a server */
export const canManageEvents = (server: Pick<Server, "permission">) => (server.permission & MANAGE_EVENTS) === MANAGE_EVENTS;
