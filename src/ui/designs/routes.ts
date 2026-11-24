/**
 * The Designs addresses (web Designs.tsx View) and the phone screen each
 * opens. Pure: the deep links and the screens share one reading.
 *
 *   /designs                 the sky and the whole wall
 *   /designs/<kind>          the wall, one kind (looks, decorations, nameplates,
 *                            effects, frames, colours, name, community)
 *   /designs/<design>        one design's page (look-…, decoration-…, an id)
 *   /designs/favourites      the designs you saved
 *   /designs/creators        everyone who published something
 *   /designs/creator/<id>    one creator and their work
 *   /designs/studio          Creator Studio: a desktop workplace, so the
 *                            phone opens the gallery (as the web does for
 *                            anyone without the creator rank)
 */
import { isDesignSlug } from "./designSlug";
import { type WallFilter, isWallFilter } from "./gallery";

const RE_ID = /^[0-9A-Za-z]{1,32}$/;

/** The in-app path for what follows `/designs` in an address */
export function designsHref(rest: string[]): string {
  const [first, second] = rest;
  if (!first) return "/designs";
  if (first === "favourites" || first === "creators")
    return `/designs/${first}`;
  if (first === "creator")
    return second && RE_ID.test(second)
      ? `/designs/creator/${second}`
      : "/designs/creators";
  if (isWallFilter(first) || isDesignSlug(first))
    return `/designs/${encodeURIComponent(first)}`;
  return "/designs";
}

/** What a `/designs/<slug>` screen shows */
export type SlugView =
  | { page: "wall"; filter: Exclude<WallFilter, "all"> }
  | { page: "design"; slug: string }
  | { page: "home" };

export function slugView(slug: string | undefined): SlugView {
  if (!slug) return { page: "home" };
  if (isWallFilter(slug))
    return { page: "wall", filter: slug as Exclude<WallFilter, "all"> };
  if (isDesignSlug(slug)) return { page: "design", slug };
  return { page: "home" };
}
