/**
 * The state behind the Designs screens (web designs/TryOn.tsx, Wall.tsx
 * useCommunity / useCommunityTiles / useBuiltInTiles / useGalleryTiles):
 * what you try on, the community designs a page at a time, and the tiles of
 * the wall for a filter.
 */
import { useLingui } from "@lingui/react/macro";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useClient } from "@/client/ClientProvider";
import { haptics } from "@/ui/kit";

import {
  type CommunityCreator,
  type CommunityItem,
  type CommunityListKind,
  type CommunityPage,
  apiBase,
  communityApi,
  communityFramesOpen,
  creatorName,
} from "./api";
import { EARLY_LIMIT, startEarlyDesigns, takeEarly } from "./early";
import {
  type TileKind,
  type Wear,
  type WallFilter,
  isGiantFrame,
  moreState,
  needsMore,
  PAGE_TILES,
  weave,
} from "./gallery";
import {
  useCast,
  useKindLabels,
  useLookText,
  useStyleLabels,
  type Person,
} from "./labels";
import { useEditStyle, useMe } from "./parts";
import { rankCreators } from "./rank";
import {
  DECORATIONS,
  EFFECT_IDS,
  LOOKS,
  NAMEPLATES,
  NAME_FONTS,
  NAME_GRADIENTS,
  NAME_SOLIDS,
  PROFILE_FRAME_IDS,
  THEME_PRESETS,
  type UserStyle,
  VIBES,
  sameStyle,
} from "./style";
import { type PartKey, tryOnStore, wornParts } from "./tryOn";

/** Ask for the wall's first page now (the Designs row was tapped) */
export function startDesigns(client: ReturnType<typeof useClient>) {
  const { url, headers } = apiBase(client);
  startEarlyDesigns(url, headers);
}

/** Keeps the try-on going while this Designs screen is open */
export function useDesignsSession() {
  const me = useMe();
  const ready = !!me;
  const retain = useEffectEvent(() => tryOnStore.retain(me?.style ?? {}));
  useEffect(() => {
    if (!ready) return;
    return retain();
  }, [ready]);
}

/** What you are trying on, shared by every Designs screen */
export function useTryOn() {
  const { t } = useLingui();
  const state = useSyncExternalStore(
    tryOnStore.subscribe,
    tryOnStore.get,
    tryOnStore.get,
  );
  const me = useMe();
  const edit = useEditStyle();
  const labels = useStyleLabels();
  const current = useMemo(() => me?.style ?? {}, [me]);
  const draft = state.draft ?? current;
  // nothing is tried on or saved before your profile has loaded: a draft
  // without it would drop the rest of your look on save
  const ready = !!me && !!state.draft;
  const changed = ready && !sameStyle(draft, current);

  const partLabel = useCallback(
    (key: PartKey, style: UserStyle) => {
      switch (key) {
        case "decoration":
          return labels.decoration(style.decoration!);
        case "nameplate":
          return labels.nameplate(style.nameplate!);
        case "profile_frame":
          return labels.frame(style.profile_frame!);
        case "effect":
          return labels.effect(style.effect!);
        case "theme": {
          const preset = THEME_PRESETS.find(
            (p) => p.colours.join() === style.theme?.join(),
          );
          return preset ? labels.theme(preset.id) : t`Own colours`;
        }
        case "font":
          return labels.font(style.name_font!);
        case "colour":
          return style.name_colour?.length === 2
            ? t`Gradient name`
            : t`Coloured name`;
      }
    },
    [labels, t],
  );

  return {
    state,
    current,
    draft,
    changed,
    parts: wornParts(draft).map((part) => ({
      ...part,
      label: partLabel(part.key, draft),
    })),
    wearing: (wear: Wear) => tryOnStore.wearing(wear),
    ready,
    toggle: (wear: Wear, name?: string) => {
      if (!ready) return false;
      const on = tryOnStore.toggle(wear, name);
      haptics.selection();
      return on;
    },
    put: (wear: Wear) => {
      if (ready) tryOnStore.put(wear);
    },
    reset: () => tryOnStore.reset(current),
    save: async () => {
      const done = await tryOnStore.save(current, edit);
      if (done) haptics.success();
      else haptics.error();
      return done;
    },
    undo: () => tryOnStore.undo(edit),
  };
}

const PAGE = 48;

type Source = {
  query?: string;
  sort?: "popular" | "new";
  favourites?: boolean;
  off?: boolean;
};

type Loaded = {
  items: CommunityItem[];
  creators: Record<string, CommunityCreator>;
  more: boolean;
};

/** One page of every kind of community design, from `offset` (web useCommunity load) */
async function fetchCommunity(
  client: ReturnType<typeof useClient>,
  now: Source,
  offset: number,
): Promise<Loaded> {
  if (now.off) return { items: [], creators: {}, more: false };
  // creators' frames only where the server has them open
  const kinds: CommunityListKind[] = communityFramesOpen(client)
    ? ["decorations", "nameplates", "effects", "frames"]
    : ["decorations", "nameplates", "effects"];
  const pages = await Promise.all(
    kinds.map((kind) => {
      const fetchPage = () =>
        communityApi.list(client, kind, {
          query: now.query || undefined,
          sort: now.sort === "new" ? undefined : "popular",
          favourites: now.favourites || undefined,
          limit: PAGE,
          offset: offset || undefined,
        });
      // the first page asked for while the screen slid in
      const first =
        !offset &&
        !now.query &&
        now.sort !== "new" &&
        !now.favourites &&
        PAGE === EARLY_LIMIT
          ? takeEarly<CommunityPage>(kind)
          : undefined;
      const answer = first ? first.catch(fetchPage) : fetchPage();
      // a server without effects or frames (switched off, or older) still shows everything else
      return kind === "effects" || kind === "frames"
        ? answer.catch(() => ({ items: [], creators: [] }) as CommunityPage)
        : answer;
    }),
  );
  const creators: Record<string, CommunityCreator> = {};
  for (const page of pages)
    for (const creator of page.creators ?? []) creators[creator._id] = creator;
  return {
    items: pages.flatMap((page) => page.items ?? []),
    creators,
    more: pages.some((page) => (page.items ?? []).length === PAGE),
  };
}

/**
 * Community designs, a page at a time, for any list in Designs (web
 * useCommunity). A new source (a search, another order) or `version` asks
 * again from the first page; the list is "loading" until that answer is in.
 */
export function useCommunity(source: Source, version = 0) {
  const client = useClient();
  const [round, setRound] = useState(0);
  const sourceKey = JSON.stringify(source);
  const want = `${version}|${round}|${sourceKey}`;
  const [data, setData] = useState<
    Loaded & { key: string; failed: boolean; offset: number }
  >({
    key: "",
    items: [],
    creators: {},
    more: false,
    failed: false,
    offset: 0,
  });
  const [paging, setPaging] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    const ask = ++asked.current;
    const now = JSON.parse(sourceKey) as Source;
    fetchCommunity(client, now, 0).then(
      (page) => {
        if (ask === asked.current)
          setData({ ...page, key: want, failed: false, offset: PAGE });
      },
      () => {
        if (ask === asked.current)
          setData((d) => ({ ...d, key: want, failed: true }));
      },
    );
  }, [want, sourceKey, client]);

  const next = async () => {
    if (paging || data.key !== want) return;
    const ask = asked.current;
    setPaging(true);
    try {
      const page = await fetchCommunity(client, source, data.offset);
      if (ask !== asked.current) return;
      setData((d) => ({
        ...d,
        items: [...d.items, ...page.items],
        creators: { ...d.creators, ...page.creators },
        more: page.more,
        offset: d.offset + PAGE,
      }));
    } catch {
      if (ask === asked.current) setData((d) => ({ ...d, failed: true }));
    } finally {
      setPaging(false);
    }
  };

  return {
    items: data.items,
    creators: data.creators,
    more: data.more,
    loading: data.key !== want || paging,
    failed: data.failed && data.key === want,
    next: () => void next(),
    retry: () => setRound((r) => r + 1),
    /** ask again and wait for the answer (pull to refresh) */
    reload: async () => {
      const ask = ++asked.current;
      try {
        const page = await fetchCommunity(client, source, 0);
        if (ask === asked.current)
          setData({ ...page, key: want, failed: false, offset: PAGE });
        return true;
      } catch {
        if (ask === asked.current)
          setData((d) => ({ ...d, key: want, failed: true }));
        return false;
      }
    },
  };
}

export type Community = ReturnType<typeof useCommunity>;

/** One thing on the wall (web Wall.tsx Tile) */
export type Tile = {
  key: string;
  kind: TileKind;
  name: string;
  /** who made it */
  maker?: string;
  wear?: Wear;
  person?: Person;
  /** shown huge */
  big?: boolean;
  /** the page of this design */
  slug?: string;
  item?: CommunityItem;
  mood?: string;
  /** on a maker's tile */
  makerId?: string;
  creator?: CommunityCreator;
  count?: number;
};

const TILE_KINDS = {
  Decoration: "frame",
  Nameplate: "plate",
  Effect: "effect",
  Frame: "card",
} as const;

/** What a community design puts on you */
export function wearOf(item: CommunityItem): Wear {
  const ref = `c:${item._id}`;
  switch (item.kind) {
    case "Nameplate":
      return { nameplate: ref, nameplate_file: item.file._id };
    case "Effect":
      return { effect: ref, effect_file: item.file._id };
    case "Frame":
      return { profile_frame: ref, profile_frame_file: item.file._id };
    default:
      return { decoration: ref, decoration_file: item.file._id };
  }
}

/** Community designs as tiles, who made each included */
export function useCommunityTiles() {
  const { t } = useLingui();
  const cast = useCast();
  return useCallback(
    (items: CommunityItem[], creators: Record<string, CommunityCreator>) =>
      items.map((item, i): Tile => ({
        key: item._id,
        kind: TILE_KINDS[item.kind] ?? "frame",
        name: item.name,
        maker: creatorName(creators[item.creator_id]) || t`A verified maker`,
        wear: wearOf(item),
        person: cast[i % cast.length],
        slug: item._id,
        item,
      })),
    [cast, t],
  );
}

/** Everything that ships with Zrzur, made by its own team */
export function useBuiltInTiles() {
  const { t } = useLingui();
  const labels = useStyleLabels();
  const lookText = useLookText();
  const cast = useCast();
  return useMemo(() => {
    const team = t`The Zrzur team`;
    const at = (i: number) => cast[i % cast.length];
    return {
      looks: (ids?: string[]): Tile[] =>
        LOOKS.filter((look) => !ids || ids.includes(look.id)).map(
          (look, i) => ({
            key: `look-${look.id}`,
            kind: "look",
            name: lookText(look.id)[0],
            maker: team,
            wear: look.style,
            person: at(i + 3),
            slug: `look-${look.id}`,
          }),
        ),
      frames: (): Tile[] =>
        DECORATIONS.map((id, i) => ({
          key: `decoration-${id}`,
          kind: "frame",
          name: labels.decoration(id),
          maker: team,
          wear: { decoration: id, decoration_file: undefined },
          person: at(i),
          slug: `decoration-${id}`,
        })),
      plates: (): Tile[] =>
        // drawn plates first, then the signs, then the flags
        [
          ...NAMEPLATES.filter((p) => p.group === "theme"),
          ...NAMEPLATES.filter((p) => p.group === "zodiac"),
          ...NAMEPLATES.filter(
            (p) => p.group !== "theme" && p.group !== "zodiac",
          ),
        ].map((plate, i) => ({
          key: `nameplate-${plate.id}`,
          kind: "plate",
          name: labels.nameplate(plate.id),
          maker: team,
          wear: { nameplate: plate.id, nameplate_file: undefined },
          person: at(i + 5),
          slug: `nameplate-${plate.id}`,
        })),
      effects: (): Tile[] =>
        EFFECT_IDS.map((id) => ({
          key: `effect-${id}`,
          kind: "effect",
          name: labels.effect(id),
          maker: team,
          wear: { effect: id },
        })),
      cards: (): Tile[] =>
        PROFILE_FRAME_IDS.map((id, i) => ({
          key: `profile-frame-${id}`,
          kind: "card",
          name: labels.frame(id),
          maker: team,
          wear: { profile_frame: id, profile_frame_file: undefined },
          person: at(i + 4),
        })),
      types: (): Tile[] =>
        NAME_FONTS.filter((font) => font.id !== "default").map((font, i) => ({
          key: `type-${font.id}`,
          kind: "type",
          name: labels.font(font.id),
          wear: { name_font: font.id },
          person: at(i + 1),
        })),
      inks: (): Tile[] =>
        [...NAME_SOLIDS.map((c) => [c]), ...NAME_GRADIENTS].map(
          (colour, i) => ({
            key: `ink-${colour.join("-")}`,
            kind: "ink",
            name: "",
            wear: { name_colour: [...colour] },
            person: at(i + 2),
          }),
        ),
    };
  }, [cast, labels, lookText, t]);
}

/** The tiles of the whole gallery for a filter (web useGalleryTiles) */
export function useGalleryTiles(input: {
  filter: WallFilter;
  mood?: string;
  query: string;
  community: Community;
  me?: boolean;
}) {
  const { t } = useLingui();
  const built = useBuiltInTiles();
  const fromCommunity = useCommunityTiles();
  const cast = useCast();
  const { filter, mood, query, community } = input;
  return useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const has = (tile: Tile) => !q || tile.name.toLocaleLowerCase().includes(q);
    const mine = fromCommunity(community.items, community.creators);
    const ids = VIBES.find((vibe) => vibe.id === mood)?.looks;
    const large = (list: Tile[], test: (i: number) => boolean) =>
      list.map((tile, i) => ({ ...tile, big: test(i) }));
    const frames = large(
      [
        ...mine.filter((tile) => tile.kind === "frame"),
        ...built.frames(),
      ].filter(has),
      isGiantFrame,
    );
    const plates = [
      ...mine.filter((tile) => tile.kind === "plate"),
      ...built.plates(),
    ].filter(has);
    const effects = [
      ...mine.filter((tile) => tile.kind === "effect"),
      ...built.effects(),
    ].filter(has);
    const cards = [
      ...mine.filter((tile) => tile.kind === "card"),
      ...built.cards(),
    ].filter(has);
    const looks = built.looks(ids).filter(has);
    const types = built.types().filter(has);
    const inks = built.inks();
    const paint: Tile = { key: "paint", kind: "paint", name: "" };
    const makers = rankCreators({
      items: community.items,
      creators: community.creators,
    }).map((entry, i): Tile => ({
      key: `maker-${entry.creator._id}`,
      kind: "maker",
      name: creatorName(entry.creator),
      makerId: entry.creator.open_page ? entry.creator._id : undefined,
      creator: entry.creator,
      count: entry.designs,
      person: cast[i % cast.length],
    }));
    const moods = VIBES.filter((vibe) => vibe.id !== "all").map(
      (vibe): Tile => ({
        key: `mood-${vibe.id}`,
        kind: "mood",
        name: "",
        mood: vibe.id,
      }),
    );
    const open: Tile = {
      key: "open",
      kind: "open",
      name: t`Your design could be here`,
    };

    switch (filter) {
      case "looks":
        return looks;
      case "decorations":
        return frames;
      case "nameplates":
        return plates;
      case "effects":
        return effects;
      case "frames":
        return cards;
      case "colours":
        return [paint];
      case "name":
        return [...types, ...inks];
      case "community":
        return weave<Tile>({
          frame: frames.filter((tile) => tile.item),
          plate: plates.filter((tile) => tile.item),
          effect: effects,
          card: cards.filter((tile) => tile.item),
        });
      default:
        if (q || mood)
          return weave<Tile>({
            look: looks,
            frame: frames,
            plate: plates,
            effect: effects,
            card: cards,
            type: types,
          });
        return weave<Tile>({
          look: looks,
          frame: frames,
          plate: plates,
          effect: effects,
          type: types,
          ink: inks.slice(0, 4),
          paint: [paint],
          mood: moods,
          maker: makers,
          open: mine.length < 6 ? [open] : [],
        });
    }
  }, [
    filter,
    mood,
    query,
    community.items,
    community.creators,
    built,
    fromCommunity,
    cast,
    t,
  ]);
}

/**
 * One page of a long list at a time (web usePaged): pages come only when
 * asked for, the next page from the server one press ahead; a new list
 * (another filter, a search, another sort) starts again from one page.
 */
export function usePaged<T>(
  list: T[],
  options: {
    key: (item: T) => string;
    more?: boolean;
    loading?: boolean;
    onMore?: () => void;
    page?: number;
  },
) {
  const page = options.page ?? PAGE_TILES;
  const [visible, setVisible] = useState(page);
  const first = list[0] === undefined ? undefined : options.key(list[0]);
  const [seen, setSeen] = useState({ first, length: list.length });
  if (seen.first !== first || seen.length !== list.length) {
    if (first !== seen.first || list.length < seen.length) setVisible(page);
    setSeen({ first, length: list.length });
  }
  const state = moreState(
    visible,
    list.length,
    !!options.more,
    !!options.loading,
    page,
  );
  return {
    shown: list.slice(0, visible),
    state,
    next: () => {
      if (state !== "more") return;
      const now = visible + page;
      setVisible(now);
      if (needsMore(now, list.length, !!options.more, !!options.loading, page))
        options.onMore?.();
    },
  };
}

export { useKindLabels };
