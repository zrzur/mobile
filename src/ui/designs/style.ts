/**
 * What a person wears on their profile (web userStyle.ts and
 * userStyleExtras.ts), and every built-in design the Designs gallery shows:
 * Zrzur's first decorations, nameplates and effects plus the design pack, the
 * profile frames, the ready-made looks and moods. Pure data and helpers.
 */
import {
  DECORATIONS as BASE_DECORATIONS,
  EFFECTS as BASE_EFFECTS,
  NAMEPLATES as BASE_NAMEPLATES,
  NAME_FONTS,
  NAME_GRADIENTS,
  NAME_SOLIDS,
  THEME_PRESETS,
} from "@/ui/settings/user/profile-catalog";

import { PACK_DECORATIONS, PACK_EFFECT_IDS, PACK_NAMEPLATES } from "./pack";

export { NAME_FONTS, NAME_GRADIENTS, NAME_SOLIDS, THEME_PRESETS };

export type UserStyle = {
  theme?: string[];
  name_font?: string;
  name_colour?: string[];
  name_effect?: string;
  /** built-in id, or `c:<id>` for a community decoration */
  decoration?: string;
  decoration_file?: string;
  nameplate?: string;
  nameplate_file?: string;
  effect?: string;
  effect_file?: string;
  profile_frame?: string;
  profile_frame_file?: string;
};

/** Every decoration the server accepts: the first ones, then the pack's */
export const DECORATIONS: readonly string[] = [
  ...BASE_DECORATIONS,
  ...PACK_DECORATIONS,
];

export type NameplateGroup = "arab" | "flag" | "theme" | "zodiac";

/** Every nameplate the server accepts (web NAMEPLATES): pack plates count as themes */
export const NAMEPLATES: { id: string; group: NameplateGroup }[] = [
  ...BASE_NAMEPLATES,
  ...PACK_NAMEPLATES.map((id) => ({ id, group: "theme" as const })),
];

/** Every effect: the first ones, then the pack's */
export const EFFECT_IDS: readonly string[] = [
  ...BASE_EFFECTS,
  ...PACK_EFFECT_IDS,
];

/** Zrzur's own profile frames (web frames/frameIds.ts) */
export const PROFILE_FRAME_IDS = ["crystal"] as const;

export const isCommunityRef = (value: string | undefined) =>
  !!value && value.startsWith("c:");

/** Where the web app keeps the built-in art (Zrzur's own server) */
export const ART_ORIGIN = "https://app.zrzur.com";
export const decorationArt = (id: string) =>
  `${ART_ORIGIN}/decorations/${id}.svg`;
export const nameplateArt = (id: string) =>
  `${ART_ORIGIN}/nameplates/${id}.svg`;

const fileId = (id: string | undefined) =>
  id && /^[\w-]+$/.test(id) ? id : undefined;

/** A community image as uploaded (it may move) */
export const communityFileUrl = (
  cdn: string | undefined,
  file: string | undefined,
) => (cdn && fileId(file) ? `${cdn}/decorations/${file}/original` : undefined);
/** One still frame of a community image, drawn by the media server */
export const communityStillUrl = (
  cdn: string | undefined,
  file: string | undefined,
) => (cdn && fileId(file) ? `${cdn}/decorations/${file}` : undefined);
/** A creator's effect: what plays */
export const effectFileUrl = (
  cdn: string | undefined,
  file: string | undefined,
) => (cdn && fileId(file) ? `${cdn}/effects/${file}/original` : undefined);
/** One still frame of a creator's effect */
export const effectStillUrl = (
  cdn: string | undefined,
  file: string | undefined,
) => (cdn && fileId(file) ? `${cdn}/effects/${file}` : undefined);

/** The picture of a decoration: our own SVG, or a creator's image */
export function decorationUrl(
  style: UserStyle,
  cdn: string | undefined,
  moving = true,
): string | undefined {
  const id = style.decoration;
  if (!id) return undefined;
  if (isCommunityRef(id))
    return moving
      ? communityFileUrl(cdn, style.decoration_file)
      : communityStillUrl(cdn, style.decoration_file);
  return DECORATIONS.includes(id) ? decorationArt(id) : undefined;
}

/** The picture of a nameplate: our own SVG, or a creator's image */
export function nameplateUrl(
  style: UserStyle,
  cdn: string | undefined,
  moving = false,
): string | undefined {
  const id = style.nameplate;
  if (!id) return undefined;
  if (isCommunityRef(id))
    return moving
      ? communityFileUrl(cdn, style.nameplate_file)
      : communityStillUrl(cdn, style.nameplate_file);
  return NAMEPLATES.some((plate) => plate.id === id)
    ? nameplateArt(id)
    : undefined;
}

/** Shape of every nameplate (web NAMEPLATE_RATIO 448 / 84) */
export const NAMEPLATE_RATIO = 448 / 84;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The style the API attached to a user (web userStyleOf): a built-in design
 * this app no longer knows counts as none, so saving still works.
 */
export function userStyleOf(user: unknown): UserStyle {
  const raw = (user as { style?: Record<string, unknown> | null } | undefined)
    ?.style;
  if (!raw || typeof raw !== "object") return {};
  const out: UserStyle = {};
  const colours = (v: unknown, most: number) =>
    Array.isArray(v)
      ? v
          .filter((c): c is string => typeof c === "string" && HEX.test(c))
          .slice(0, most)
      : [];
  const theme = colours(raw.theme, 2);
  if (theme.length) out.theme = theme;
  const name = colours(raw.name_colour, 5);
  if (name.length) out.name_colour = name;
  for (const key of [
    "name_font",
    "name_effect",
    "decoration",
    "decoration_file",
    "nameplate",
    "nameplate_file",
    "effect",
    "effect_file",
    "profile_frame",
    "profile_frame_file",
  ] as const) {
    const v = raw[key];
    if (typeof v === "string" && v) out[key] = v;
  }
  if (
    out.decoration &&
    !isCommunityRef(out.decoration) &&
    !DECORATIONS.includes(out.decoration)
  ) {
    delete out.decoration;
    delete out.decoration_file;
  }
  if (
    out.nameplate &&
    !isCommunityRef(out.nameplate) &&
    !NAMEPLATES.some((p) => p.id === out.nameplate)
  ) {
    delete out.nameplate;
    delete out.nameplate_file;
  }
  if (
    out.effect &&
    !isCommunityRef(out.effect) &&
    !EFFECT_IDS.includes(out.effect)
  ) {
    delete out.effect;
    delete out.effect_file;
  }
  if (
    out.profile_frame &&
    !isCommunityRef(out.profile_frame) &&
    !(PROFILE_FRAME_IDS as readonly string[]).includes(out.profile_frame)
  ) {
    delete out.profile_frame;
    delete out.profile_frame_file;
  }
  return out;
}

/** Each style field: a choice (always sent) or a file the server fills in */
const STYLE_FIELDS: Record<keyof UserStyle, "choice" | "server"> = {
  theme: "choice",
  name_font: "choice",
  name_colour: "choice",
  name_effect: "choice",
  decoration: "choice",
  decoration_file: "server",
  nameplate: "choice",
  nameplate_file: "server",
  effect: "choice",
  effect_file: "server",
  profile_frame: "choice",
  profile_frame_file: "server",
};

/**
 * The style as it is sent to save it (web sendableStyle): the server replaces
 * the whole style, so every piece that is on goes in; image ids are filled in
 * by the server, except a creator's effect, which keeps its file.
 */
export function sendableStyle(style: UserStyle): UserStyle {
  const sent: Record<string, unknown> = {};
  for (const key of Object.keys(STYLE_FIELDS) as (keyof UserStyle)[]) {
    const value = style[key];
    if (Array.isArray(value) ? !value.length : !value) continue;
    if (
      STYLE_FIELDS[key] === "server" &&
      !(key === "effect_file" && style.effect)
    )
      continue;
    sent[key] = value;
  }
  return sent as UserStyle;
}

const sameList = (a?: string[], b?: string[]) =>
  (a ?? []).join() === (b ?? []).join();

/** Whether two styles show the same thing (web TryOn sameStyle) */
export function sameStyle(a: UserStyle, b: UserStyle) {
  return (
    sameList(a.theme, b.theme) &&
    (a.name_font ?? "default") === (b.name_font ?? "default") &&
    sameList(a.name_colour, b.name_colour) &&
    (a.name_effect ?? "") === (b.name_effect ?? "") &&
    (a.decoration ?? "") === (b.decoration ?? "") &&
    (a.nameplate ?? "") === (b.nameplate ?? "") &&
    (a.effect ?? "") === (b.effect ?? "") &&
    (a.profile_frame ?? "") === (b.profile_frame ?? "")
  );
}

/** Whether every field of `wanted` is what the person wears (web DesignPage worn) */
export function wearsAll(mine: UserStyle | undefined, wanted: UserStyle) {
  if (!mine) return false;
  return Object.entries(wanted).every(([key, value]) =>
    Array.isArray(value)
      ? JSON.stringify(mine[key as keyof UserStyle]) === JSON.stringify(value)
      : mine[key as keyof UserStyle] === value,
  );
}

/**
 * Ready-made looks (web Looks.tsx): a profile theme, a name font and colour,
 * a decoration and a nameplate that go together; worn in one tap.
 */
export type Look = {
  id: string;
  style: Required<
    Pick<
      UserStyle,
      "theme" | "name_font" | "name_colour" | "decoration" | "nameplate"
    >
  >;
};

export const LOOKS: Look[] = [
  {
    id: "night-glow",
    style: {
      theme: ["#3d1e6d", "#035aa6"],
      name_font: "bold",
      name_colour: ["#8e2de2", "#e100ff"],
      decoration: "star-orbit",
      nameplate: "midnight",
    },
  },
  {
    id: "golden-hour",
    style: {
      theme: ["#ff6b4a", "#ffb347"],
      name_font: "serif",
      name_colour: ["#ff9a44", "#ffcc33"],
      decoration: "sun-rays",
      nameplate: "sunset",
    },
  },
  {
    id: "deep-sea",
    style: {
      theme: ["#1e9bb8", "#6fd3e8"],
      name_font: "rounded",
      name_colour: ["#2193b0", "#6dd5ed"],
      decoration: "ice-crystal",
      nameplate: "ocean",
    },
  },
  {
    id: "fresh-mint",
    style: {
      theme: ["#11998e", "#38ef7d"],
      name_font: "rounded",
      name_colour: ["#38d39f"],
      decoration: "ivy",
      nameplate: "mint",
    },
  },
  {
    id: "blossom",
    style: {
      theme: ["#ff9a9e", "#fecfef"],
      name_font: "script",
      name_colour: ["#ff5c8a"],
      decoration: "hearts",
      nameplate: "sakura",
    },
  },
  {
    id: "ember",
    style: {
      theme: ["#eb3349", "#f45c43"],
      name_font: "wide",
      name_colour: ["#ff6b4a", "#a66bff"],
      decoration: "flame-ring",
      nameplate: "autumn",
    },
  },
  {
    id: "arcade",
    style: {
      theme: ["#0f2027", "#2c5364"],
      name_font: "pixel",
      name_colour: ["#3ec6e0"],
      decoration: "neon",
      nameplate: "midnight",
    },
  },
  {
    id: "storm",
    style: {
      theme: ["#00c6ff", "#0072ff"],
      name_font: "bold",
      name_colour: ["#ffffff"],
      decoration: "lightning",
      nameplate: "aurora",
    },
  },
  {
    id: "cosmos",
    style: {
      theme: ["#8b2be2", "#e0218a"],
      name_font: "wide",
      name_colour: ["#a66bff"],
      decoration: "moon-halo",
      nameplate: "zodiac-pisces",
    },
  },
  {
    id: "studio",
    style: {
      theme: ["#0f2027", "#2c5364"],
      name_font: "mono",
      name_colour: ["#ffffff"],
      decoration: "music-notes",
      nameplate: "midnight",
    },
  },
  {
    id: "victory",
    style: {
      theme: ["#f7971e", "#ffd200"],
      name_font: "serif",
      name_colour: ["#ffd200"],
      decoration: "laurel",
      nameplate: "sunset",
    },
  },
  {
    id: "winter",
    style: {
      theme: ["#2193b0", "#6dd5ed"],
      name_font: "rounded",
      name_colour: ["#ffffff"],
      decoration: "snow",
      nameplate: "clouds",
    },
  },
];

/** Moods for the look filter: which looks feel like what */
export const VIBES: { id: string; looks: string[] }[] = [
  { id: "all", looks: LOOKS.map((look) => look.id) },
  { id: "calm", looks: ["deep-sea", "fresh-mint", "winter", "blossom"] },
  { id: "bold", looks: ["ember", "arcade", "storm", "cosmos"] },
  { id: "warm", looks: ["golden-hour", "ember", "victory", "blossom"] },
  { id: "night", looks: ["night-glow", "cosmos", "studio", "arcade"] },
];

/**
 * The ground designs are shown on: always dark, like a profile card, so a
 * preview looks the same in every app theme (web --z-designs-art-ground,
 * --z-designs-on-art: the Midnight Pulse nav and title colours).
 */
export const ART = {
  ground: "#171925",
  ink: "#F7F8FC",
  inkMuted: "rgba(247,248,252,0.72)",
  edge: "rgba(255,255,255,0.14)",
  /** a card without a theme of its own */
  plainTheme: ["#2a2c3d", "#1d1f2d"],
} as const;

/** The sample people in previews: a name msgid, a pack face and a profile colour (web useCast) */
export const CAST: { face: number; colour: string }[] = [
  { face: 0, colour: "#8b2be2" },
  { face: 1, colour: "#1e9bb8" },
  { face: 2, colour: "#eb3349" },
  { face: 5, colour: "#11998e" },
  { face: 3, colour: "#f7971e" },
  { face: 11, colour: "#0072ff" },
  { face: 4, colour: "#134e5e" },
  { face: 7, colour: "#ff6b4a" },
  { face: 8, colour: "#c2185b" },
  { face: 9, colour: "#3d1e6d" },
  { face: 6, colour: "#a66bff" },
  { face: 10, colour: "#38d39f" },
];
