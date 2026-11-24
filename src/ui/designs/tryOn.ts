/**
 * What you are trying on, kept for the whole of Designs (web TryOn.tsx):
 * every tile on every Designs screen changes the same mirror, and nothing
 * reaches your profile until you save. One store for all Designs screens;
 * it starts from your profile when the first Designs screen opens and is
 * forgotten when the last one closes. Pure (no React), so it is tested.
 */
import { type Wear, isOn, takenOff } from "./gallery";
import { type UserStyle } from "./style";

export type TryOnState = {
  /** what you have on in Designs; undefined before Designs opens */
  draft?: UserStyle;
  saving: boolean;
  /** your profile before the last save, for Undo */
  saved?: UserStyle;
  error?: unknown;
  /** the name of the last design put on */
  lastName?: string;
  /** a design that just landed on you, counted so the dock can greet it */
  landed: number;
};

const empty = (): TryOnState => ({ saving: false, landed: 0 });

export function createTryOnStore() {
  let state: TryOnState = empty();
  let users = 0;
  const listeners = new Set<() => void>();
  const set = (next: Partial<TryOnState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const draft = () => state.draft ?? {};

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** a Designs screen opened; the first one starts from your profile */
    retain(current: UserStyle) {
      users++;
      if (!state.draft) set({ draft: { ...current } });
      return () => {
        users--;
        if (users <= 0) {
          users = 0;
          state = empty();
        }
      };
    },
    /** put pieces on (or off, with undefined values) */
    put(wear: Wear) {
      set({
        draft: { ...draft(), ...wear },
        error: undefined,
        saved: undefined,
      });
    },
    /** a tap: on, or off again when it is already on. Returns whether it went on. */
    toggle(wear: Wear, name?: string) {
      if (isOn(draft(), wear)) {
        set({
          draft: { ...draft(), ...takenOff(wear) },
          error: undefined,
          saved: undefined,
          lastName: undefined,
        });
        return false;
      }
      set({
        draft: { ...draft(), ...wear },
        error: undefined,
        saved: undefined,
        lastName: name,
        landed: state.landed + 1,
      });
      return true;
    },
    reset(current: UserStyle) {
      set({ draft: { ...current }, error: undefined, lastName: undefined });
    },
    /** save what is on to your profile; `edit` sends it */
    async save(
      current: UserStyle,
      edit: (style: UserStyle) => Promise<unknown>,
    ) {
      set({ saving: true, error: undefined });
      try {
        await edit(draft());
        set({ saving: false, saved: current });
        return true;
      } catch (error) {
        set({ saving: false, error });
        return false;
      }
    },
    /** back to the profile before the last save */
    async undo(edit: (style: UserStyle) => Promise<unknown>) {
      const before = state.saved;
      if (!before) return;
      set({ draft: { ...before }, saving: true });
      try {
        await edit(before);
        set({ saving: false, saved: undefined });
      } catch (error) {
        set({ saving: false, error });
      }
    },
    wearing: (wear: Wear) => isOn(draft(), wear),
  };
}

export type TryOnStore = ReturnType<typeof createTryOnStore>;

/**
 * Whether the dock says "Saved to your profile" with its Undo: after a save
 * while what is on matches your profile, and for the whole of an Undo, so
 * the note goes only when your profile is back as it was (the draft changes
 * first, before the profile has heard of it).
 */
export const showsSaved = (state: TryOnState, changed: boolean) =>
  !!state.saved && (state.saving || !changed);

/** The one store every Designs screen shares */
export const tryOnStore = createTryOnStore();

/** The pieces you have on, each with what takes it off (web TryOn parts) */
export type PartKey =
  | "decoration"
  | "nameplate"
  | "profile_frame"
  | "effect"
  | "theme"
  | "font"
  | "colour";

export function wornParts(style: UserStyle): { key: PartKey; clear: Wear }[] {
  const list: { key: PartKey; clear: Wear }[] = [];
  if (style.decoration)
    list.push({
      key: "decoration",
      clear: { decoration: undefined, decoration_file: undefined },
    });
  if (style.nameplate)
    list.push({
      key: "nameplate",
      clear: { nameplate: undefined, nameplate_file: undefined },
    });
  if (style.profile_frame)
    list.push({
      key: "profile_frame",
      clear: { profile_frame: undefined, profile_frame_file: undefined },
    });
  if (style.effect)
    list.push({
      key: "effect",
      clear: { effect: undefined, effect_file: undefined },
    });
  if (style.theme?.length)
    list.push({ key: "theme", clear: { theme: undefined } });
  if (style.name_font && style.name_font !== "default")
    list.push({ key: "font", clear: { name_font: undefined } });
  if (style.name_colour?.length)
    list.push({ key: "colour", clear: { name_colour: undefined } });
  return list;
}
