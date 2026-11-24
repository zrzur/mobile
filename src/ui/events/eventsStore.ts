/**
 * Server events on the phone. The events themselves live in the SDK's
 * `client.serverEvents` (the gateway keeps them current); what the
 * installed SDK does not keep yet — your answer, whether you organise an
 * event, drafts and past events — is kept here, filled from the same REST
 * routes the web uses (web: sdk-js beta ServerEventCollection).
 */
import type { Client } from "@zrzur/sdk/solid";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";

import { compareEvents, isUpcoming } from "./eventFormat";
import type { Attendee, AttendeeFilter, EventAnswerValue, EventChanges, EventList, EventResponse, Rsvp, ServerEvent } from "./types";

type Api = {
  get: (path: string, query?: unknown) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body?: unknown) => Promise<unknown>;
  patch: (path: string, body?: unknown) => Promise<unknown>;
  delete: (path: string, body?: unknown) => Promise<unknown>;
};

type Sdk = {
  get(id: string): ServerEvent | undefined;
  forServer(serverId: string): ServerEvent[];
  upsert(event: ServerEvent): unknown;
  remove(id: string): void;
};

const api = (client: Client) => client.api as unknown as Api;
export const sdkEvents = (client: Client) => client.serverEvents as unknown as Sdk;

const rsvps = new Map<string, Rsvp | null>();
const organisers = new Map<string, boolean>();
const drafts = new Map<string, string[]>();
const loaded = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const base = (serverId: string) => `/servers/${serverId}/events`;

function keep(client: Client, response: EventResponse) {
  sdkEvents(client).upsert(response.event);
  rsvps.set(response.event._id, response.rsvp ?? null);
  if (response.organiser !== undefined) organisers.set(response.event._id, response.organiser);
  emit();
  return response.event;
}

/** Load a server's upcoming events (and the drafts you manage) */
export async function fetchServerEvents(client: Client, serverId: string, withDrafts: boolean): Promise<void> {
  const list = (await api(client).get(base(serverId), withDrafts ? { drafts: true } : {})) as EventList;
  const listed = new Set(list.events.map((e) => e._id));
  const sdk = sdkEvents(client);
  for (const stale of sdk.forServer(serverId)) if (!listed.has(stale._id)) sdk.remove(stale._id);
  const own = new Map((list.answers ?? []).map((a) => [a.event, a]));
  const draftIds: string[] = [];
  for (const event of list.events) {
    sdk.upsert(event);
    if (event.status === "Draft") draftIds.push(event._id);
    const answer = own.get(event._id);
    const known = rsvps.get(event._id);
    // a list does not say where you stand on a waiting list: keep what a fetch of the event told
    rsvps.set(event._id, answer ? { ...answer, position: known?.answer === answer.answer ? known.position : undefined, muted: known?.muted } : null);
  }
  drafts.set(serverId, draftIds);
  loaded.add(serverId);
  emit();
}

/** Events that start in a time range, past and cancelled ones too */
export async function fetchRange(client: Client, serverId: string, from: string, to: string): Promise<ServerEvent[]> {
  const list = (await api(client).get(base(serverId), { from, to })) as EventList;
  const own = new Map((list.answers ?? []).map((a) => [a.event, a]));
  for (const event of list.events) {
    sdkEvents(client).upsert(event);
    if (!rsvps.has(event._id)) rsvps.set(event._id, own.get(event._id) ?? null);
  }
  emit();
  return list.events;
}

/** One event (also a past one), with your answer and whether you run it */
export async function fetchEvent(client: Client, serverId: string, id: string): Promise<ServerEvent> {
  return keep(client, (await api(client).get(`${base(serverId)}/${id}`)) as EventResponse);
}

export async function setAnswer(client: Client, serverId: string, id: string, answer: EventAnswerValue) {
  return keep(client, (await api(client).put(`${base(serverId)}/${id}/rsvp`, { answer })) as EventResponse);
}

export async function withdrawAnswer(client: Client, serverId: string, id: string) {
  const response = (await api(client).delete(`${base(serverId)}/${id}/rsvp`)) as EventResponse;
  return keep(client, { ...response, rsvp: null });
}

/** Reminders and change notices of one event, for you */
export async function setEventMuted(client: Client, serverId: string, id: string, muted: boolean) {
  return keep(client, (await api(client).put(`${base(serverId)}/${id}/notices`, { muted })) as EventResponse);
}

export async function createEvent(client: Client, serverId: string, body: EventChanges): Promise<ServerEvent> {
  const event = (await api(client).post(base(serverId), body)) as ServerEvent;
  sdkEvents(client).upsert(event);
  organisers.set(event._id, true);
  if (event.status === "Draft") drafts.set(serverId, [...(drafts.get(serverId) ?? []), event._id]);
  emit();
  return event;
}

export async function editEvent(client: Client, serverId: string, id: string, body: EventChanges): Promise<ServerEvent> {
  const event = (await api(client).patch(`${base(serverId)}/${id}`, body)) as ServerEvent;
  sdkEvents(client).upsert(event);
  emit();
  return event;
}

/** start, end, publish, copy: a POST that answers with the event */
export async function eventAction(client: Client, serverId: string, id: string, action: "start" | "end" | "publish" | "copy"): Promise<ServerEvent> {
  const event = (await api(client).post(`${base(serverId)}/${id}/${action}`)) as ServerEvent;
  sdkEvents(client).upsert(event);
  if (action === "copy") {
    organisers.set(event._id, true);
    drafts.set(serverId, [...(drafts.get(serverId) ?? []), event._id]);
  }
  if (action === "publish") drafts.set(serverId, (drafts.get(serverId) ?? []).filter((d) => d !== id));
  emit();
  return event;
}

export async function cancelEvent(client: Client, serverId: string, id: string, series: boolean): Promise<ServerEvent> {
  const event = (await api(client).post(`${base(serverId)}/${id}/cancel`, series ? { series: true } : {})) as ServerEvent;
  sdkEvents(client).upsert(event);
  emit();
  return event;
}

export async function deleteEvent(client: Client, serverId: string, id: string, series: boolean): Promise<void> {
  await api(client).delete(`${base(serverId)}/${id}`, series ? { series: true } : {});
  sdkEvents(client).remove(id);
  drafts.set(serverId, (drafts.get(serverId) ?? []).filter((d) => d !== id));
  emit();
}

export async function fetchAttendees(client: Client, serverId: string, id: string, query: { answer: AttendeeFilter; after?: string; limit: number }): Promise<{ attendees: Attendee[]; next?: string | null }> {
  return (await api(client).get(`${base(serverId)}/${id}/attendees`, query)) as { attendees: Attendee[]; next?: string | null };
}

/**
 * Read one value of the store and re-render when it changes. The value is
 * read inside the snapshot function on purpose: the React Compiler treats
 * module state as unchanging and would keep a value read in the hook body
 * (`loaded.has(id)` after a bare version read) from the first render for
 * good: the events list then spun forever after its fetch had landed.
 */
function useStore<T>(read: () => T): T {
  return useSyncExternalStore(subscribe, read, read);
}

/** Re-render when answers, drafts or loads change (the number of changes so far) */
function useVersion() {
  return useStore(() => version);
}

const NO_DRAFTS: string[] = [];

export function useRsvp(id: string | undefined): Rsvp | null | undefined {
  return useStore(() => (id ? rsvps.get(id) : undefined));
}

/** Ids of the events you answer Going or Maybe to */
export function useTakingPart(): Set<string> {
  const v = useVersion();
  return useMemo(() => {
    void v;
    return new Set([...rsvps].filter(([, r]) => !!r && r.answer !== "NotGoing").map(([id]) => id));
  }, [v]);
}

/** Whether you may run this event (known once fetched by itself) */
export function useOrganiser(id: string | undefined): boolean | undefined {
  return useStore(() => (id ? organisers.get(id) : undefined));
}

export function useEventsLoaded(serverId: string): boolean {
  return useStore(() => loaded.has(serverId));
}

/** Ids of a server's scheduled and active events, happening ones first */
export function useServerEventIds(serverId: string): string {
  const client = useClient();
  return useSolid(
    useCallback(
      () =>
        sdkEvents(client)
          .forServer(serverId)
          .filter(isUpcoming)
          .sort(compareEvents)
          .map((e) => e._id)
          .join(","),
      [client, serverId],
    ),
  );
}

/** The event happening now in a server, if any */
export function useLiveEventId(serverId: string): string {
  const client = useClient();
  return useSolid(
    useCallback(
      () =>
        sdkEvents(client)
          .forServer(serverId)
          .find((e) => e.status === "Active")?._id ?? "",
      [client, serverId],
    ),
  );
}

/** One event, live from the gateway (a snapshot: the store keeps one object as it changes) */
export function useServerEvent(id: string | undefined): ServerEvent | undefined {
  const client = useClient();
  const json = useSolid(
    useCallback(() => {
      const event = id ? sdkEvents(client).get(id) : undefined;
      return event ? JSON.stringify(event) : "";
    }, [client, id]),
  );
  return useMemo(() => (json ? (JSON.parse(json) as ServerEvent) : undefined), [json]);
}

/** The drafts you manage in a server */
export function useDraftIds(serverId: string): string[] {
  return useStore(() => drafts.get(serverId) ?? NO_DRAFTS);
}

/** For tests: forget everything the store keeps */
export function resetEventsStore() {
  rsvps.clear();
  organisers.clear();
  drafts.clear();
  loaded.clear();
  emit();
}

/**
 * Your events across all your servers, soonest first (web: serverEvents
 * fetchMine, GET /users/@me/events). Kept like the others; returns the ids.
 */
export async function fetchMyEvents(client: Client, query: { from?: string; to?: string; answer?: string; limit?: number } = {}): Promise<string[]> {
  const mine = (await api(client).get("/users/@me/events", query)) as { events: ServerEvent[]; answers?: { event: string; answer: EventAnswerValue; waiting?: boolean }[] };
  const own = new Map((mine.answers ?? []).map((a) => [a.event, a]));
  for (const event of mine.events) {
    sdkEvents(client).upsert(event);
    const answer = own.get(event._id);
    const known = rsvps.get(event._id);
    rsvps.set(event._id, answer ? { ...answer, position: known?.answer === answer.answer ? known.position : undefined, muted: known?.muted } : (known ?? null));
  }
  emit();
  return mine.events.map((e) => e._id);
}

/** What a share link shows (web: EventLinkPage, GET /invites/event/:path) */
export type EventLinkPreview = { title: string; starts_at: string; ends_at?: string | null; status: ServerEvent["status"]; server_name: string; server?: string | null; event?: string | null };

export async function fetchEventLink(client: Client, path: string): Promise<EventLinkPreview> {
  return (await api(client).get(`/invites/event/${encodeURIComponent(path)}`)) as EventLinkPreview;
}

/** Join the invited people of an event (web: serverEvents.acceptInvitation) */
export async function acceptEventInvitation(client: Client, code: string): Promise<{ server: string; event: string }> {
  return (await api(client).post(`/invites/event/${encodeURIComponent(code)}`)) as { server: string; event: string };
}
