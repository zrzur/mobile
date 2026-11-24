/**
 * Polls: the rules the server applies to a new poll and the arithmetic of
 * the results (web `channels/text/poll/pollModel.ts`), plus the relative
 * "Ends in …" time the web takes from dayjs.
 */

/** Hours a poll may stay open: 1 h, 4 h, 8 h, 24 h, 3 days, 1 week, 2 weeks */
export const POLL_DURATIONS = [1, 4, 8, 24, 72, 168, 336] as const;
export type PollDuration = (typeof POLL_DURATIONS)[number];
export const QUESTION_MAX = 300;
export const ANSWER_MAX = 55;
export const ANSWERS_MIN = 2;
export const ANSWERS_MAX = 10;

/** One answer row while the poll is written; `key` keeps the row stable */
export type DraftAnswer = { key: string; text: string; emoji?: string };

/** What the server takes (`API.DataPoll`) */
export type DataPoll = {
  question: string;
  answers: { text: string; emoji?: string }[];
  duration: number;
  allow_multiselect: boolean;
};

type Counted = { answers: { id: number; text: string; count?: number }[] };

const length = (text: string) => [...text].length;

/** What still stops the poll from being sent, if anything */
export function draftProblem(question: string, answers: DraftAnswer[]): "question" | "answers" | "answer" | undefined {
  if (!question.trim() || length(question) > QUESTION_MAX) return "question";
  const filled = answers.filter((answer) => answer.text.trim());
  if (filled.length < ANSWERS_MIN || filled.length > ANSWERS_MAX) return "answers";
  if (filled.some((answer) => length(answer.text) > ANSWER_MAX)) return "answer";
  return undefined;
}

/** The poll as the server takes it: text trimmed, empty rows left out */
export function toDataPoll(question: string, answers: DraftAnswer[], duration: number, multiple: boolean): DataPoll {
  return {
    question: question.trim(),
    answers: answers
      .filter((answer) => answer.text.trim())
      .map((answer) => (answer.emoji ? { text: answer.text.trim(), emoji: answer.emoji } : { text: answer.text.trim() })),
    duration,
    allow_multiselect: multiple,
  };
}

/** The list with one item moved; a move off either end changes nothing */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Remove a row; with only two left, the row is emptied instead */
export function removeAnswer(list: DraftAnswer[], index: number): DraftAnswer[] {
  if (list.length <= ANSWERS_MIN) return list.map((answer, i) => (i === index ? { key: answer.key, text: "" } : answer));
  return list.filter((_, i) => i !== index);
}

export function pollTotal(poll: Counted): number {
  return poll.answers.reduce((sum, answer) => sum + (answer.count ?? 0), 0);
}

/** Whole percentages that add up to 100 (largest remainder) */
export function pollPercents(poll: Counted): number[] {
  const total = pollTotal(poll);
  if (!total) return poll.answers.map(() => 0);
  const exact = poll.answers.map((answer) => ((answer.count ?? 0) * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, rest: value - floors[index] })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index]++;
    left--;
  }
  return floors;
}

/** Pressing an answer chooses it, or takes it back if it is yours */
export function voteAction(poll: { me?: number[] | null }, answer: number): "vote" | "unvote" {
  return poll.me?.includes(answer) ? "unvote" : "vote";
}

/** The author ends their own open poll; Manage Messages ends anyone's */
export function canEndPoll(who: { author: boolean; manage: boolean; closed: boolean }): boolean {
  return !who.closed && (who.author || who.manage);
}

/** Polls are on for this server only on a clear yes (`features.polls`) */
export function pollsEnabled(client: { configuration?: { features?: { polls?: boolean } } | undefined } | null | undefined): boolean {
  return client?.configuration?.features?.polls === true;
}

/** Web `pollClosed`: ended early, or past its end time */
export function isClosed(poll: { ended?: boolean; expires_at: string }, now: Date): boolean {
  return !!poll.ended || new Date(poll.expires_at).getTime() <= now.getTime();
}

/** The answer a poll's voter list opens on: the first one with votes */
export function firstVotedAnswer(poll: { answers: { id: number; count?: number }[] }): number | undefined {
  return poll.answers.find((a) => (a.count ?? 0) > 0)?.id ?? poll.answers[0]?.id;
}

/**
 * dayjs `fromNow` thresholds as a value and unit for Intl.RelativeTimeFormat
 * ("in a few seconds" becomes "in 30 seconds", the only difference)
 */
export function relativeParts(ms: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const sign = ms < 0 ? -1 : 1;
  const s = Math.abs(ms) / 1000;
  const m = s / 60;
  const h = m / 60;
  const d = h / 24;
  if (s < 45) return { value: sign * Math.max(1, Math.round(s)), unit: "second" };
  if (m < 45) return { value: sign * Math.max(1, Math.round(m)), unit: "minute" };
  if (h < 22) return { value: sign * Math.max(1, Math.round(h)), unit: "hour" };
  if (d < 26) return { value: sign * Math.max(1, Math.round(d)), unit: "day" };
  if (d < 320) return { value: sign * Math.max(1, Math.round(d / 30.4)), unit: "month" };
  return { value: sign * Math.max(1, Math.round(d / 365)), unit: "year" };
}

/** Text that stands for a poll where only text fits (reply previews) */
export function pollSummary(poll: { question: string; answers: { text: string; emoji?: string | null }[] }): string {
  const lines = [`📊 ${poll.question}`];
  for (const answer of poll.answers) {
    const emoji = answer.emoji ? (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(answer.emoji) ? `:${answer.emoji}: ` : `${answer.emoji} `) : "";
    lines.push(`• ${emoji}${answer.text}`);
  }
  return lines.join("\n");
}

/** A custom emoji id (ULID) rather than a Unicode emoji */
export const isCustomEmoji = (emoji: string) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(emoji);
