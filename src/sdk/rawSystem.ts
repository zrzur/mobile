import { SystemMessage } from "@zrzur/sdk/solid";

/**
 * The API's own system object behind each SDK system message. The installed
 * SDK (2.0.0) builds its classes from it and drops fields that are newer
 * than its typings, such as `missed` on a call (backend: SystemMessage::
 * CallStarted { by, finished_at, missed }). Every system message the SDK
 * builds goes through `SystemMessage.from`, so it is wrapped once to keep
 * the raw object beside the instance; `rawSystem` reads it back.
 */

const RAW = new WeakMap<object, Record<string, unknown>>();
const MARK = Symbol.for("zrzur.rawSystem");

type From = (client: unknown, parent: unknown, message: Record<string, unknown>) => object;

export function keepRawSystemMessages() {
  const holder = SystemMessage as unknown as { from: From & { [MARK]?: true } };
  if (holder.from[MARK]) return;
  const original = holder.from;
  const wrapped = function (this: unknown, client: unknown, parent: unknown, message: Record<string, unknown>) {
    const built = original.call(this, client, parent, message);
    if (built && typeof built === "object" && message && typeof message === "object") RAW.set(built, message);
    return built;
  } as From & { [MARK]?: true };
  wrapped[MARK] = true;
  holder.from = wrapped;
}

/** The raw system object of an SDK system message (undefined when it was built before the wrap) */
export function rawSystem(systemMessage: unknown): Record<string, unknown> | undefined {
  return systemMessage && typeof systemMessage === "object" ? RAW.get(systemMessage) : undefined;
}

keepRawSystemMessages();
