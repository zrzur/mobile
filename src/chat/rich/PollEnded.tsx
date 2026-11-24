import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import { intlLocale } from "@/chat/time";
import { isolate } from "@/ui/kit/bidi";

/** The parts of the SDK's PollEndedSystemMessage this reads */
export type PollEndedFields = { question: string; winners: string[]; votes: number; total: number };

/** "A and B" in the reader's language (plain commas where Intl.ListFormat is missing) */
export function joinNames(names: string[], locale: string): string {
  const List = (Intl as { ListFormat?: new (l: string, o: { type: string }) => { format(v: string[]): string } }).ListFormat;
  if (List) {
    try {
      return new List(intlLocale(locale), { type: "conjunction" }).format(names);
    } catch {
      // unknown locale: fall through
    }
  }
  return names.join(", ");
}

/**
 * The line posted when a poll closes (web PollEnded): the winner and its
 * votes, a tie, or that nobody voted. For the chat's system-message row.
 * (Placeholders are written as the web writes them, so the msgids match.)
 */
export function usePollEndedText(message: PollEndedFields): string {
  const { t, i18n } = useLingui();
  // people's words keep their own direction inside the sentence (an Arabic question never turns an English line around)
  const said = { question: isolate(message.question) };
  const winners = (message.winners ?? []).map(isolate);
  const quoted = (text: string) => t`“${text}”`;
  const total = () => t`${plural(message.total, { one: "# vote", other: "# votes" })}`;
  const tied = () => joinNames(winners.map(quoted), i18n.locale);
  if (winners.length === 0) return t`The poll “${said.question}” ended with no votes.`;
  if (winners.length === 1) return t`The poll “${said.question}” ended: “${winners[0]}” won with ${message.votes} of ${total()}.`;
  return t`The poll “${said.question}” ended in a tie: ${tied()}.`;
}
