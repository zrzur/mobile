/** Which greeting the hour calls for (web: home/greeting.ts) */
export type GreetingKind = "late" | "morning" | "afternoon" | "evening";

export function greetingKind(hour: number): GreetingKind {
  return hour < 5 ? "late" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
