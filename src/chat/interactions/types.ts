/**
 * Zrzur developer platform on the phone (web: interactions/types.ts):
 * commands, components, modals and private answers as the API serves them,
 * without the `null` fields.
 *
 * Everything that comes from a bot is untrusted text: it is drawn as plain
 * text or through the normal message Markdown, never as markup.
 */
import type { API, WithoutNull } from "@zrzur/sdk/solid";

export type OptionType = API.CommandOptionType;
export type Localizations = Record<string, string>;
export type OptionChoice = WithoutNull<API.CommandOptionChoice>;
export type CommandOption = WithoutNull<API.ApplicationCommandOption>;
export type ApplicationCommand = WithoutNull<API.ApplicationCommand>;
export type CommandApplication = WithoutNull<API.CommandApplication>;
export type ServerCommands = WithoutNull<API.ServerCommands>;
export type OptionValue = API.InteractionOptionValue;
export type DataOption = WithoutNull<API.InteractionDataOption>;
export type ButtonStyle = API.ButtonStyle;
export type SelectOption = WithoutNull<API.SelectOption>;
export type Component = WithoutNull<API.Component>;
export type MediaItem = WithoutNull<API.MediaItem>;
export type ComponentBlock = WithoutNull<API.ComponentBlock>;
export type Modal = WithoutNull<API.Modal>;
export type ModalFieldValue = WithoutNull<API.ModalFieldValue>;
export type InteractionAccepted = API.InteractionAccepted;
export type CreateInteraction = API.DataCreateInteraction;

/** A message only the person who used the command sees */
export type EphemeralMessage = {
  _id: string;
  interaction_id: string;
  author: string;
  channel_id: string;
  content?: string;
  embeds?: unknown[];
  components?: ComponentBlock[];
  edited?: string;
};

/** Gateway events of the developer platform, as received by a person */
export type InteractionEvent =
  | { type: "InteractionStateUpdate"; id: string; channel_id: string; state: "Deferred" | "DeferredUpdate" | "Responded" | "Failed" }
  | { type: "EphemeralMessageCreate"; message: EphemeralMessage }
  | { type: "EphemeralMessageUpdate"; message: EphemeralMessage }
  | { type: "EphemeralMessageDelete"; id: string; channel_id: string }
  | { type: "InteractionModal"; id: string; channel_id: string; modal: Modal }
  | { type: "InteractionAutocompleteResult"; id: string; choices: OptionChoice[] }
  | { type: "ApplicationCommandsUpdate"; application_id: string; server_id: string };

const EVENT_TYPES = new Set<string>([
  "InteractionStateUpdate",
  "EphemeralMessageCreate",
  "EphemeralMessageUpdate",
  "EphemeralMessageDelete",
  "InteractionModal",
  "InteractionAutocompleteResult",
  "ApplicationCommandsUpdate",
]);

/** Whether a gateway packet is one of the developer platform's */
export function isInteractionEvent(event: { type: string }): event is InteractionEvent {
  return EVENT_TYPES.has(event.type);
}

/** The reader's language from a localisation map, else the default text */
export function localized(fallback: string, map: Localizations | null | undefined, locale: string): string {
  if (!map) return fallback;
  return map[locale] ?? map[locale.split("-")[0]] ?? fallback;
}

/** A command's name as shown (`/name` for chat commands) */
export const commandName = (command: ApplicationCommand, locale: string) => localized(command.name, command.name_localizations, locale);
