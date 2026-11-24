/**
 * Keys for hook dependency lists and pick snapshots. Never JSON of arbitrary
 * objects: the SDK client and its stores are circular, and JSON of them
 * crashed the lobby ("Converting circular structure to JSON").
 */

/** Identity numbers for objects in dependency lists (never JSON: SDK objects are circular) */
const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;

/**
 * A string key for a dependency list: primitives by value, objects and
 * functions by identity. Arrays of primitives (common filter lists) keep a
 * value key so a fresh array with the same members does not rebuild.
 */
export function depsKey(deps: readonly unknown[]): string {
  return deps.map(depKey).join("|");
}

function depKey(d: unknown): string {
  if (d === null) return "null";
  switch (typeof d) {
    case "string":
      return `s:${JSON.stringify(d)}`;
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return `${(typeof d)[0]}:${String(d)}`;
    case "symbol":
      return `y:${d.description ?? ""}`;
    case "object":
    case "function": {
      if (Array.isArray(d) && d.every((x) => x === null || (typeof x !== "object" && typeof x !== "function"))) {
        return `a:[${d.map(depKey).join(",")}]`;
      }
      return `o:${objectId(d as object)}`;
    }
  }
  return "?";
}

function objectId(o: object): number {
  let id = objectIds.get(o);
  if (id === undefined) {
    id = ++nextObjectId;
    objectIds.set(o, id);
  }
  return id;
}

/**
 * A comparable snapshot of a `pick` result. Values are written out as JSON
 * as before (reading every field keeps the accessor subscribed to them).
 * When that fails (circular SDK objects), class instances, maps and repeats
 * stand in by identity instead, so the screen never crashes.
 */
export function snapshotOf(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    const seen = new WeakSet<object>();
    try {
      return (
        JSON.stringify(value, (_key, v: unknown) => {
          if (typeof v === "bigint") return `#n${String(v)}`;
          if (typeof v === "function") return `#o${objectId(v)}`;
          if (typeof v !== "object" || v === null) return v;
          const proto = Object.getPrototypeOf(v) as unknown;
          if ((proto !== Object.prototype && proto !== Array.prototype && proto !== null) || seen.has(v)) return `#o${objectId(v)}`;
          seen.add(v);
          return v;
        }) ?? String(value)
      );
    } catch {
      return typeof value === "object" && value !== null ? `#o${objectId(value)}` : String(value);
    }
  }
}
