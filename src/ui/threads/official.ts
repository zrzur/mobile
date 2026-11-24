/** The newest official message's first line without markdown, as the ticket subject (web: OfficialBanner subject) */
export function replySubject(content: string | undefined, re: (first: string) => string): string {
  const first = content?.split("\n")[0]?.replace(/\*/g, "").trim() ?? "";
  return first ? re(first).slice(0, 120) : "";
}
