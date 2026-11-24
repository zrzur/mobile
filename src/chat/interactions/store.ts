/**
 * Interactions with bots (web: interactions/store.ts): running a command,
 * using a button or a menu, submitting a bot's form, private answers and
 * the per-channel command lists. One gateway listener per client; screens
 * read the state through the hooks below.
 *
 * Private answers live in memory for this app session (the web keeps them
 * per tab); they leave when their token expires.
 */
import { i18n } from "@lingui/core";
import { type Client, withoutNull } from "@zrzur/sdk/solid";
import { useEffect, useState, useSyncExternalStore } from "react";

import { newUlid } from "@/ui/server/ulid";

import { uploadAttachment } from "../upload";

import { commandsKey, dmCommands, EPHEMERAL_LIFETIME_MS, ephemeralExpiry, withEphemeral } from "./logic";
import {
  type ApplicationCommand,
  type CreateInteraction,
  type DataOption,
  type EphemeralMessage,
  type InteractionAccepted,
  type InteractionEvent,
  isInteractionEvent,
  type Modal,
  type ModalFieldValue,
  type OptionChoice,
  type ServerCommands,
} from "./types";

/** An interaction this person started and is waiting on */
export type PendingInteraction = {
  id: string;
  channelId: string;
  applicationId: string;
  /** What to show while waiting, e.g. `/hello` */
  label?: string;
  state: "pending" | "deferred" | "failed";
  /** Error type from the API, or `Timeout` */
  error?: string;
  /** The component that started it, so it shows progress */
  componentKey?: string;
  createdAt: number;
};

export type InteractionState = {
  ephemeral: Record<string, EphemeralMessage[]>;
  pending: Record<string, PendingInteraction>;
  /** Components waiting for an answer, by `messageId:customId` */
  busy: Record<string, true>;
  /** Why a button or menu just failed, by `messageId:customId` */
  componentErrors: Record<string, string>;
  modal?: { id: string; channelId: string; modal: Modal; applicationId?: string };
  commands: Record<string, ServerCommands>;
  /** What started each interaction, e.g. `/hello` */
  labels: Record<string, string>;
};

let state: InteractionState = { ephemeral: {}, pending: {}, busy: {}, componentErrors: {}, commands: {}, labels: {} };
const listeners = new Set<() => void>();

function update(change: (draft: InteractionState) => InteractionState) {
  state = change(state);
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Read a part of the state (re-renders when that part changes) */
export function useInteractionState<T>(pick: (s: InteractionState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => pick(state),
    () => pick(state),
  );
}

export const interactionSnapshot = () => state;

/** The language a bot is told to answer in: the one the app is shown in */
export const interactionLocale = () => i18n.locale || "en";

/** Unique per click or submit, so retries never run an action twice */
export const nonce = () => newUlid(Date.now(), Math.random);

/** How long after the deadline we wait before calling it a timeout */
const GRACE_MS = 1500;

const autocompleteWaiters = new Map<string, (choices: OptionChoice[]) => void>();
// a fast bot can answer before our own request returns: keep such events briefly
const earlyStates = new Map<string, "Deferred" | "DeferredUpdate" | "Responded" | "Failed">();
const earlyChoices = new Map<string, OptionChoice[]>();
function remember<T>(map: Map<string, T>, id: string, value: T) {
  map.set(id, value);
  setTimeout(() => map.delete(id), 10_000);
}
const commandRequests = new Map<string, Promise<ServerCommands>>();
const generations = new Map<string, number>();
const attached = new WeakSet<Client>();

function omit<T>(record: Record<string, T>, key: string | undefined): Record<string, T> {
  if (!key || !(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function finish(id: string) {
  const pending = state.pending[id];
  update((s) => ({ ...s, busy: omit(s.busy, pending?.componentKey), pending: omit(s.pending, id) }));
}

function fail(id: string, error: string) {
  const pending = state.pending[id];
  const key = pending?.componentKey;
  update((s) => ({
    ...s,
    busy: omit(s.busy, key),
    componentErrors: key ? { ...s.componentErrors, [key]: error } : s.componentErrors,
    pending: s.pending[id] ? { ...s.pending, [id]: { ...s.pending[id], state: "failed", error } } : s.pending,
  }));
  // the line stays a little while so it can be read
  setTimeout(() => {
    if (state.pending[id]?.state === "failed") finish(id);
    if (key && state.componentErrors[key] === error) update((s) => ({ ...s, componentErrors: omit(s.componentErrors, key) }));
  }, 8000);
}

function addEphemeral(message: EphemeralMessage) {
  update((s) => ({ ...s, ephemeral: { ...s.ephemeral, [message.channel_id]: withEphemeral(s.ephemeral[message.channel_id], message) } }));
  const expiry = ephemeralExpiry(message) ?? Date.now() + EPHEMERAL_LIFETIME_MS;
  setTimeout(() => dismissEphemeral(message.channel_id, message._id), Math.max(expiry - Date.now(), 0));
}

/** Remove a private answer (its "Dismiss" button, or expiry) */
export function dismissEphemeral(channelId: string, messageId: string) {
  const list = state.ephemeral[channelId];
  if (!list?.some((m) => m._id === messageId)) return;
  const left = list.filter((m) => m._id !== messageId);
  update((s) => {
    const ephemeral = { ...s.ephemeral };
    if (left.length) ephemeral[channelId] = left;
    else delete ephemeral[channelId];
    return { ...s, ephemeral };
  });
}

function onEvent(event: InteractionEvent) {
  switch (event.type) {
    case "InteractionStateUpdate": {
      if (!state.pending[event.id]) {
        remember(earlyStates, event.id, event.state);
        return;
      }
      if (event.state === "Deferred") {
        // the bot is preparing an answer: "thinking…" until it arrives
        const entry = state.pending[event.id];
        update((s) => ({ ...s, busy: omit(s.busy, entry?.componentKey), pending: { ...s.pending, [event.id]: { ...entry, state: "deferred" } } }));
      } else if (event.state === "Failed") fail(event.id, "Timeout");
      else finish(event.id);
      break;
    }
    case "EphemeralMessageCreate":
    case "EphemeralMessageUpdate":
      addEphemeral(withoutNull(event.message as never) as EphemeralMessage);
      break;
    case "EphemeralMessageDelete":
      dismissEphemeral(event.channel_id, event.id);
      break;
    case "InteractionModal":
      update((s) => ({ ...s, modal: { id: event.id, channelId: event.channel_id, modal: withoutNull(event.modal as never) as Modal, applicationId: s.pending[event.id]?.applicationId } }));
      break;
    case "InteractionAutocompleteResult": {
      const waiter = autocompleteWaiters.get(event.id);
      if (waiter) {
        waiter(event.choices);
        autocompleteWaiters.delete(event.id);
      } else remember(earlyChoices, event.id, event.choices);
      break;
    }
    case "ApplicationCommandsUpdate": {
      // the server's lists and the DM lists load again; answers on their way are dropped
      const stale = (key: string) => key === event.server_id || key.startsWith(`${event.server_id}#`) || key.startsWith("dm:");
      const keys = new Set([...Object.keys(state.commands), ...commandRequests.keys()]);
      let commands = state.commands;
      for (const key of keys) {
        if (!stale(key)) continue;
        commandRequests.delete(key);
        generations.set(key, (generations.get(key) ?? 0) + 1);
        commands = omit(commands, key);
      }
      update((s) => ({ ...s, commands }));
      break;
    }
  }
}

/** Listen to the gateway once per client */
export function attachInteractions(client: Client) {
  if (attached.has(client)) return;
  attached.add(client);
  const events = client.events as unknown as { on: (name: "event", listener: (event: { type: string }) => void) => void };
  events.on("event", (event) => {
    if (isInteractionEvent(event)) onEvent(event);
  });
}

/** Mount in each chat screen: listens to the gateway for this client */
export function useInteractions(client: Client) {
  useEffect(() => attachInteractions(client), [client]);
}

// ----- command lists -----

function loadInto(key: string, fetch: () => Promise<ServerCommands>) {
  if (state.commands[key]) return Promise.resolve(state.commands[key]);
  let request = commandRequests.get(key);
  if (!request) {
    const generation = generations.get(key) ?? 0;
    request = fetch().then((commands) => {
      if ((generations.get(key) ?? 0) === generation) update((s) => ({ ...s, commands: { ...s.commands, [key]: commands } }));
      return commands;
    });
    const mine = request;
    request.catch(() => {
      if (commandRequests.get(key) === mine) commandRequests.delete(key);
    });
    commandRequests.set(key, request);
  }
  return request;
}

const api = (client: Client) => client.api as unknown as { get: (path: string, query?: unknown) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> };

/** Load the commands for a key from `commandsKey` */
export function loadCommands(client: Client, key: string): Promise<ServerCommands> {
  if (key.startsWith("dm:")) {
    const botId = key.slice(3);
    return loadInto(key, async () => {
      const commands = withoutNull((await api(client).get(`/bots/${botId}/commands`)) as never) as ApplicationCommand[];
      const user = client.users.get(botId);
      return dmCommands({ _id: botId, username: user?.username ?? "", display_name: user?.displayName }, commands);
    });
  }
  const [serverId, channelId] = key.split("#");
  return loadInto(key, async () => withoutNull((await api(client).get(`/servers/${serverId}/commands`, channelId ? { channel: channelId } : undefined)) as never) as ServerCommands);
}

export type CommandsLoad = { status: "none" | "loading" | "ready" | "error"; list?: ServerCommands; retry: () => void };

/** The commands this person may use in a channel (loaded once until they change) */
export function useChannelCommands(
  client: Client,
  channel: { id: string; type: string; serverId?: string; parentId?: string; recipient?: { id: string; bot?: unknown } } | undefined,
  enabled = true,
): CommandsLoad {
  const key = channel ? commandsKey(channel) : undefined;
  const list = useInteractionState((s) => (key ? s.commands[key] : undefined));
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !enabled) return;
    let live = true;
    loadCommands(client, key).then(
      () => live && setFailed(undefined),
      () => live && setFailed(key),
    );
    return () => {
      live = false;
    };
  }, [client, key, enabled, attempt]);
  const retry = () => {
    setFailed(undefined);
    setAttempt((n) => n + 1);
  };
  if (!key) return { status: "none", retry };
  if (list) return { status: "ready", list, retry };
  return { status: failed === key ? "error" : "loading", retry };
}

// ----- starting interactions -----

async function start(client: Client, data: CreateInteraction, extra: { label?: string; componentKey?: string }) {
  const componentKey = extra.componentKey;
  if (componentKey) update((s) => ({ ...s, busy: { ...s.busy, [componentKey]: true }, componentErrors: omit(s.componentErrors, componentKey) }));
  try {
    const accepted = (await api(client).post("/interactions/", data)) as InteractionAccepted;
    if (state.modal?.id === accepted._id && !state.modal.applicationId) {
      update((s) => ({ ...s, modal: s.modal ? { ...s.modal, applicationId: accepted.application_id } : s.modal }));
    }
    if (!state.pending[accepted._id]) {
      const entry: PendingInteraction = {
        id: accepted._id,
        channelId: data.channel_id,
        applicationId: accepted.application_id,
        label: extra.label,
        state: "pending",
        componentKey,
        createdAt: Date.now(),
      };
      update((s) => ({ ...s, pending: { ...s.pending, [accepted._id]: entry }, labels: extra.label ? { ...s.labels, [accepted._id]: extra.label } : s.labels }));
      const waitMs = new Date(accepted.respond_by).getTime() - Date.now() + GRACE_MS;
      setTimeout(() => state.pending[accepted._id]?.state === "pending" && fail(accepted._id, "Timeout"), Math.max(waitMs, GRACE_MS));
      const expiresMs = new Date(accepted.expires_at).getTime() - Date.now();
      setTimeout(() => state.pending[accepted._id]?.state === "deferred" && fail(accepted._id, "Timeout"), Math.max(expiresMs, GRACE_MS));
      const early = earlyStates.get(accepted._id);
      if (early) {
        earlyStates.delete(accepted._id);
        onEvent({ type: "InteractionStateUpdate", id: accepted._id, channel_id: data.channel_id, state: early });
      }
    }
    return accepted;
  } catch (error) {
    if (componentKey) update((s) => ({ ...s, busy: omit(s.busy, componentKey) }));
    // show the failure where the answer would have appeared
    const id = `local-${nonce()}`;
    update((s) => ({
      ...s,
      pending: { ...s.pending, [id]: { id, channelId: data.channel_id, applicationId: data.application_id ?? "", label: extra.label, state: "pending", componentKey, createdAt: Date.now() } },
    }));
    const type = (error as { type?: unknown } | null)?.type;
    fail(id, typeof type === "string" ? type : "Unknown");
    throw error;
  }
}

export function runCommand(client: Client, channelId: string, command: ApplicationCommand, options: DataOption[], targetId?: string) {
  return start(
    client,
    {
      type: "Command",
      application_id: command.application_id,
      channel_id: channelId,
      command_id: command._id,
      command_version: command.version,
      options,
      target_id: targetId,
      nonce: nonce(),
      locale: interactionLocale(),
    },
    { label: command.type === "ChatInput" ? `/${command.name}` : command.name },
  );
}

export function pressComponent(client: Client, channelId: string, messageId: string, customId: string, values?: string[]) {
  const componentKey = `${messageId}:${customId}`;
  // taps while the first one is on its way do nothing
  if (state.busy[componentKey]) return Promise.resolve(undefined);
  return start(client, { type: "Component", channel_id: channelId, message_id: messageId, custom_id: customId, values, nonce: nonce(), locale: interactionLocale() }, { componentKey });
}

export function submitModal(client: Client, parentId: string, channelId: string, customId: string, fields: ModalFieldValue[]) {
  return start(client, { type: "ModalSubmit", channel_id: channelId, parent_id: parentId, custom_id: customId, fields, nonce: nonce(), locale: interactionLocale() }, {});
}

export const closeModal = () => update((s) => ({ ...s, modal: undefined }));

/** The bot did not send suggestions in time */
export class AutocompleteTimeout extends Error {
  constructor() {
    super("The bot did not answer");
    this.name = "AutocompleteTimeout";
  }
}

/**
 * Ask the bot for suggestions. Resolves with no choices when `signal`
 * aborts (newer typing); rejects with `AutocompleteTimeout` when the bot
 * does not answer in time, so "no matches" and "no answer" differ.
 */
export async function requestAutocomplete(client: Client, channelId: string, command: ApplicationCommand, options: DataOption[], focused: string, signal: AbortSignal): Promise<OptionChoice[]> {
  const accepted = (await (client.api as unknown as { post: (p: string, b: unknown, o: unknown) => Promise<unknown> }).post(
    "/interactions/autocomplete",
    {
      type: "Autocomplete",
      application_id: command.application_id,
      channel_id: channelId,
      command_id: command._id,
      command_version: command.version,
      options,
      focused,
      nonce: nonce(),
      locale: interactionLocale(),
    },
    { signal },
  )) as InteractionAccepted;
  const early = earlyChoices.get(accepted._id);
  if (early) {
    earlyChoices.delete(accepted._id);
    return early;
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      autocompleteWaiters.delete(accepted._id);
      reject(new AutocompleteTimeout());
    }, 3000 + GRACE_MS);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      autocompleteWaiters.delete(accepted._id);
      resolve([]);
    });
    autocompleteWaiters.set(accepted._id, (choices) => {
      clearTimeout(timer);
      resolve(choices);
    });
  });
}

/** Uploads a file for an Attachment option (answers the file id) */
export async function uploadOptionFile(client: Client, file: { uri: string; name: string; type: string; size?: number }) {
  return uploadAttachment(client, file, () => {}).promise;
}

/** For tests: start from an empty state */
export function resetInteractionsForTest() {
  state = { ephemeral: {}, pending: {}, busy: {}, componentErrors: {}, commands: {}, labels: {} };
  for (const l of listeners) l();
}

/** For tests: feed a gateway event */
export const feedInteractionEvent = (event: InteractionEvent) => onEvent(event);
