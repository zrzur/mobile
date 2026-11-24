/**
 * The first page of community designs, asked for early (web
 * interface/designs/early.ts). The web site asks while its own code
 * downloads; the phone asks the moment Designs is tapped, while the screen
 * slides in, so the wall usually has its first page when it appears.
 *
 * On the public web site the request goes without credentials (a visitor);
 * the phone passes the session's headers, so each design also says whether
 * it is one of your favourites.
 *
 * Kept small and without imports.
 */

/** The kinds the wall shows, in the order it asks for them */
export const EARLY_KINDS = ["decorations", "nameplates", "effects"] as const;

/** What the wall asks for first: most worn, one page */
export const EARLY_LIMIT = 48;

const early = new Map<string, Promise<unknown>>();

/** The paths of the site that open on the wall (not a design, not creators) */
export function opensWall(path: string) {
  const first = path.split("/").filter(Boolean)[0];
  return (
    first === undefined ||
    [
      "looks",
      "decorations",
      "nameplates",
      "effects",
      "frames",
      "colours",
      "name",
      "community",
    ].includes(first)
  );
}

/**
 * Ask for the first page of each kind now. Without `headers`, without
 * credentials (the web site's visitor); with them, as the signed-in person.
 */
export function startEarlyDesigns(
  api: string,
  headers?: Record<string, string>,
) {
  for (const kind of EARLY_KINDS) {
    const url = `${api.replace(/\/+$/, "")}/community/${kind}?sort=popular&limit=${EARLY_LIMIT}`;
    const asked = fetch(
      url,
      headers ? { headers } : { credentials: "omit" },
    ).then((response) => {
      if (!response.ok) throw new Error(`community ${response.status}`);
      return response.json();
    });
    // nobody may ever take it: never an unhandled rejection
    asked.catch(() => {});
    early.set(kind, asked);
  }
}

/** The early answer for a kind, once; undefined when there is none */
export function takeEarly<T>(kind: string): Promise<T> | undefined {
  const asked = early.get(kind);
  early.delete(kind);
  return asked as Promise<T> | undefined;
}

/** Tests only: forget every early answer */
export function clearEarly() {
  early.clear();
}
