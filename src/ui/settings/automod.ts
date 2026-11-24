import type { IconName } from "@/ui/Icon";

/** Filter rules (web: settings/server/automod.ts) */
export type TriggerType = "Keywords" | "MentionSpam" | "LinkSpam" | "RepeatedMessages";
export type Trigger =
  | { type: "Keywords"; words: string[]; allow?: string[] }
  | { type: "MentionSpam"; max: number }
  | { type: "LinkSpam"; new_member_minutes?: number | null; allowed_domains?: string[] }
  | { type: "RepeatedMessages"; channels: number; seconds: number };
export type Rule = {
  id: string;
  name: string;
  enabled?: boolean;
  trigger: Trigger;
  actions: { block?: boolean; alert_channel?: string | null; timeout_minutes?: number | null };
  exempt_roles?: string[];
  exempt_channels?: string[];
};

export const MAX_RULES = 10;
export const PRESET_ID = "preset-arabic-insults";
export const PRESET_WORDS = ["يا كلب", "يا حمار", "عاهرة"];
export const TRIGGER_ICON: Record<TriggerType, IconName> = { Keywords: "text-aa", MentionSpam: "at", LinkSpam: "link", RepeatedMessages: "copy" };

export const DEFAULTS: Record<TriggerType, Trigger> = {
  Keywords: { type: "Keywords", words: [], allow: [] },
  MentionSpam: { type: "MentionSpam", max: 5 },
  LinkSpam: { type: "LinkSpam", new_member_minutes: 10, allowed_domains: [] },
  RepeatedMessages: { type: "RepeatedMessages", channels: 3, seconds: 30 },
};

/** Split a typed list on new lines, commas and Arabic commas (web: automod.ts) */
export function parseList(text: string) {
  return text
    .split(/[\n,،]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function newRule(rules: Rule[]): Rule {
  let n = rules.length + 1;
  while (rules.some((r) => r.id === `rule${n}`)) n++;
  return { id: `rule${n}`, name: "", enabled: true, trigger: DEFAULTS.Keywords, actions: { block: true }, exempt_roles: [], exempt_channels: [] };
}

export function upsertRule(rules: Rule[], rule: Rule) {
  return rules.some((r) => r.id === rule.id) ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule];
}

export type Problem = "name" | "words" | "numbers" | "link" | "action" | null;

/** The first thing that keeps a rule from being saved */
export function problemOf(rule: Rule): Problem {
  if (!rule.name.trim()) return "name";
  const tr = rule.trigger;
  if (tr.type === "Keywords" && tr.words.length === 0) return "words";
  if (tr.type === "MentionSpam" && !(tr.max >= 1 && tr.max <= 50)) return "numbers";
  if (tr.type === "RepeatedMessages" && !(tr.channels >= 2 && tr.channels <= 20 && tr.seconds >= 1 && tr.seconds <= 3600)) return "numbers";
  if (tr.type === "LinkSpam" && !tr.new_member_minutes && !(tr.allowed_domains ?? []).length) return "link";
  if (!rule.actions.block && !rule.actions.alert_channel && !rule.actions.timeout_minutes) return "action";
  return null;
}
