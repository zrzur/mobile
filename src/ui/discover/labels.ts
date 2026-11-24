import { useLingui } from "@lingui/react/macro";

/** Topic and language names in the person's language (web: useDiscoverLabels) */
export function useDiscoverLabels() {
  const { t, i18n } = useLingui();
  const names: Record<string, string> = {
    gaming: t`Gaming`,
    community: t`Community`,
    education: t`Education`,
    technology: t`Technology`,
    art: t`Art & Creativity`,
    music: t`Music`,
    entertainment: t`Entertainment`,
    anime: t`Anime & Manga`,
    sports: t`Sports`,
    science: t`Science`,
    languages: t`Languages`,
    moderation: t`Moderation`,
    utility: t`Utility`,
    fun: t`Fun`,
    games: t`Games`,
    social: t`Social`,
    other: t`Other`,
  };
  return {
    category: (id?: string) => (id && names[id] ? names[id] : ""),
    language: (code?: string) => {
      if (!code) return "";
      try {
        return new Intl.DisplayNames([i18n.locale || "en"], { type: "language" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
  };
}

/** The display names of the paid Discover tiers (web: useTierName); "Ad" stands next to them */
export function useTierName() {
  const { t } = useLingui();
  const names: Record<string, string> = { Boost: t`Promoted`, SuperBoost: t`Spotlight`, MegaBoost: t`Headline`, TopRow: t`Top row` };
  return (kind: string) => names[kind] ?? kind;
}

/** A plain name for every server permission, as in the role editor (web: usePermissionTitles) */
export function usePermissionTitles() {
  const { t } = useLingui();
  const names: Record<number, string> = {
    0: t`Manage channel`,
    1: t`Manage server`,
    2: t`Manage permissions`,
    3: t`Manage roles`,
    4: t`Manage customisation`,
    6: t`Kick members`,
    7: t`Ban members`,
    8: t`Timeout members`,
    9: t`Assign roles`,
    10: t`Change nickname`,
    11: t`Manage nicknames`,
    12: t`Change avatar`,
    13: t`Remove avatars`,
    20: t`View channel`,
    21: t`Read message history`,
    22: t`Send messages`,
    23: t`Manage messages`,
    24: t`Manage webhooks`,
    25: t`Invite others`,
    26: t`Send embeds`,
    27: t`Upload files`,
    28: t`Masquerade`,
    29: t`React`,
    30: t`Connect`,
    31: t`Speak`,
    32: t`Video`,
    33: t`Mute members`,
    34: t`Deafen members`,
    35: t`Move members`,
    36: t`Listen`,
    37: t`Mention everyone`,
    38: t`Mention roles`,
    39: t`Bypass slowmode`,
    40: t`View audit log`,
    41: t`Use emojis from other servers`,
    42: t`Manage join requests`,
    43: t`Create threads`,
    44: t`Send messages in threads`,
    45: t`Create forum posts`,
  };
  const groups: Record<string, string> = { server: t`Server`, members: t`Members`, messages: t`Messages`, voice: t`Voice`, other: t`Other` };
  return {
    name: (bit: number) => {
      const n = Math.round(Math.log2(bit));
      return names[n] ?? t`Permission number ${n}`;
    },
    group: (id: string) => groups[id] ?? id,
  };
}
