/**
 * The words of Designs (web Looks.tsx useLookText / useVibeText /
 * useVibeLine, styleLabels.tsx, profiles/labels.ts, Scenes.tsx useCast):
 * the same source strings as the web, so its translations carry over.
 */
import { useLingui } from "@lingui/react/macro";

import { useLookLabels } from "@/ui/settings/user/profile-labels";

import { usePackLabels } from "./packLabels";
import { CAST, isCommunityRef } from "./style";

/** Translated look names and one-line descriptions */
export function useLookText() {
  const { t } = useLingui();
  const text: Record<string, [string, string]> = {
    "night-glow": [t`Night glow`, t`Violet light for late talks.`],
    "golden-hour": [t`Golden hour`, t`Warm sunset colours and a gold ring.`],
    "deep-sea": [t`Deep sea`, t`Cool blues with a touch of ice.`],
    "fresh-mint": [t`Fresh mint`, t`Light, green and full of sparkle.`],
    blossom: [t`Blossom`, t`Soft pink with hearts.`],
    ember: [t`Ember`, t`Bold reds and flames.`],
    arcade: [t`Arcade`, t`Pixel name and a neon ring.`],
    storm: [t`Storm`, t`Bright blue with lightning.`],
    cosmos: [t`Cosmos`, t`A galaxy around you.`],
    studio: [t`Studio`, t`Headphones on, music up.`],
    victory: [t`Victory`, t`Gold laurel for winners.`],
    winter: [t`Winter`, t`Snow and calm blue.`],
  };
  return (id: string): [string, string] => text[id] ?? [id, ""];
}

export function useVibeText() {
  const { t } = useLingui();
  const text: Record<string, string> = {
    all: t`All`,
    calm: t`Calm`,
    bold: t`Bold`,
    warm: t`Warm`,
    night: t`Night`,
  };
  return (id: string) => text[id] ?? id;
}

/** One line for a mood when it is shown as a collection */
export function useVibeLine() {
  const { t } = useLingui();
  const text: Record<string, string> = {
    calm: t`Soft colours for long evenings.`,
    bold: t`Loud, bright and hard to miss.`,
    warm: t`Sunset tones and a little gold.`,
    night: t`Made for the late shift.`,
  };
  return (id: string) => text[id] ?? "";
}

/** Names of every built-in design: the app's labels plus the design pack's and the frames */
export function useStyleLabels() {
  const { t } = useLingui();
  const base = useLookLabels();
  const pack = usePackLabels();
  const frames: Record<string, string> = { crystal: t`Crystal cave` };
  return {
    decoration: (id: string) =>
      isCommunityRef(id)
        ? t`Community decoration`
        : (pack.decorations[id] ?? base.decoration(id)),
    nameplate: (id: string) =>
      isCommunityRef(id)
        ? t`Community nameplate`
        : (pack.nameplates[id] ?? base.nameplate(id)),
    effect: (id: string) =>
      isCommunityRef(id)
        ? t`Community effect`
        : (pack.effects[id] ?? base.effect(id)),
    frame: (id: string) =>
      isCommunityRef(id) ? t`Community frame` : (frames[id] ?? id),
    font: base.font,
    theme: base.theme,
  };
}

export type Person = { name: string; colour: string; face: number };

/** The sample people in the previews (web useCast) */
export function useCast(): Person[] {
  const { t } = useLingui();
  const names = [
    t`Sara`,
    t`Omar`,
    t`Lina`,
    t`Yusuf`,
    t`Noor`,
    t`Karim`,
    t`Maya`,
    t`Hadi`,
    t`Rana`,
    t`Tarek`,
    t`Salma`,
    t`Zaid`,
  ];
  return CAST.map((person, i) => ({ ...person, name: names[i] }));
}

/** The kinds of designs as the gallery names them */
export function useKindLabels() {
  const { t } = useLingui();
  return {
    all: t`Everything`,
    looks: t`Looks`,
    decorations: t`Decorations`,
    nameplates: t`Nameplates`,
    effects: t`Effects`,
    frames: t`Frames`,
    colours: t`Colours`,
    name: t`Name`,
    community: t`Community`,
  } as const;
}
