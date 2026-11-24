import { useLingui } from "@lingui/react/macro";

import { intlLocale } from "@/chat/time";

import { isCommunityRef } from "./profile-catalog";

/** Shown names of every built-in look, in the app language (web styleLabels.tsx) */
export function useLookLabels() {
  const { t, i18n } = useLingui();

  const decorations: Record<string, string> = {
    laurel: t`Laurel`,
    "light-crown": t`Crown of light`,
    rings: t`Rings`,
    ivy: t`Ivy`,
    "thorn-roses": t`Thorn roses`,
    "ice-crystal": t`Ice crystal`,
    "flame-ring": t`Flame ring`,
    lightning: t`Lightning`,
    "moon-halo": t`Moon halo`,
    "sun-rays": t`Sun rays`,
    "star-orbit": t`Stars in orbit`,
    "sakura-branch": t`Cherry branch`,
    "geometric-hex": t`Hexagon`,
    neon: t`Neon`,
    wings: t`Wing frame`,
    feathers: t`Feathers`,
    gear: t`Gears`,
    circuit: t`Circuit`,
    waves: t`Waves`,
    leaves: t`Autumn wreath`,
    snow: t`Snow`,
    hearts: t`Hearts`,
    "music-notes": t`Music notes`,
    "shield-frame": t`Shield`,
  };

  const plates: Record<string, string> = {
    aurora: t`Aurora`,
    autumn: t`Autumn`,
    sakura: t`Cherry blossoms`,
    ocean: t`Ocean`,
    clouds: t`Clouds`,
    sunset: t`Sunset`,
    midnight: t`Midnight`,
    mint: t`Mint`,
    "zodiac-aries": t`Aries`,
    "zodiac-taurus": t`Taurus`,
    "zodiac-gemini": t`Gemini`,
    "zodiac-cancer": t`Cancer`,
    "zodiac-leo": t`Leo`,
    "zodiac-virgo": t`Virgo`,
    "zodiac-libra": t`Libra`,
    "zodiac-scorpio": t`Scorpio`,
    "zodiac-sagittarius": t`Sagittarius`,
    "zodiac-capricorn": t`Capricorn`,
    "zodiac-aquarius": t`Aquarius`,
    "zodiac-pisces": t`Pisces`,
    "flag-gb-eng": t`England`,
    "flag-gb-sct": t`Scotland`,
    "flag-kurdistan": t`Kurdistan`,
  };

  const effects: Record<string, string> = {
    snow: t`Snow`,
    rain: t`Rain`,
    confetti: t`Confetti`,
    sparks: t`Sparks`,
    petals: t`Petals`,
    bubbles: t`Bubbles`,
    leaves: t`Leaves`,
    fireflies: t`Fireflies`,
    ripples: t`Ripples`,
    kites: t`Kites`,
    aurora: t`Aurora`,
    starfall: t`Falling stars`,
    lanterns: t`Lanterns`,
    sakura: t`Cherry petals`,
    embers: t`Embers`,
    planes: t`Paper planes`,
    butterflies: t`Butterflies`,
    ink: t`Ink drops`,
    shards: t`Crystal shards`,
    comet: t`Comet`,
    "glass-rain": t`Rain on glass`,
    dust: t`Sparkle dust`,
    sunrays: t`Sun rays`,
    moons: t`Moon phases`,
    bloom: t`Geometric bloom`,
    waves: t`Wave lines`,
    burst: t`Confetti burst`,
    feathers: t`Feathers`,
    dandelions: t`Dandelion seeds`,
    hearts: t`Rising hearts`,
  };

  const fonts: Record<string, string> = {
    default: t`Default`,
    bold: t`Bold`,
    serif: t`Serif`,
    mono: t`Mono`,
    script: t`Script`,
    pixel: t`Pixel`,
    wide: t`Wide`,
    rounded: t`Rounded`,
    geo: t`Geometric`,
    modern: t`Modern`,
    elegant: t`Elegant`,
    strong: t`Strong`,
    clear: t`Clear`,
    soft: t`Soft`,
    slab: t`Slab`,
    classic: t`Classic`,
    comic: t`Comic`,
    typewriter: t`Typewriter`,
    code: t`Code`,
    kufi: t`Arabic sans`,
  };

  let regions: Intl.DisplayNames | undefined;
  try {
    regions = new Intl.DisplayNames([intlLocale(i18n.locale)], { type: "region" });
  } catch {
    regions = undefined;
  }
  const country = (code: string) => {
    try {
      return regions?.of(code.toUpperCase()) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  };

  // the ready-made profile themes (web styleLabels.tsx `themes`)
  const themes: Record<string, string> = {
    Sunset: t`Sunset`,
    Ocean: t`Ocean`,
    Grape: t`Grape`,
    Mint: t`Mint`,
    Midnight: t`Midnight`,
    Cherry: t`Cherry`,
    Gold: t`Gold`,
    Aurora: t`Aurora`,
    Rose: t`Rose`,
    Forest: t`Forest`,
    Neon: t`Neon`,
    Candy: t`Candy`,
  };

  /** An id we have no name for (a pack design): its words, capitalised */
  const fallback = (id: string) => id.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

  return {
    decoration: (id: string) => (isCommunityRef(id) ? t`Community decoration` : (decorations[id] ?? fallback(id))),
    nameplate: (id: string) =>
      isCommunityRef(id) ? t`Community nameplate` : (plates[id] ?? (id.startsWith("flag-") ? country(id.slice(5)) : fallback(id))),
    effect: (id: string) => (isCommunityRef(id) ? t`Community effect` : (effects[id] ?? fallback(id))),
    font: (id: string) => fonts[id] ?? fallback(id),
    theme: (id: string) => themes[id] ?? fallback(id),
  };
}
