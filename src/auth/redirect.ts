/**
 * Where the root layout sends a person (src/app/_layout.tsx). Pure, so the
 * rules are tested in __tests__/redirect.test.ts.
 */

/**
 * Whether the root navigator can take the move: it lists the target group.
 * A group whose guard just opened is added a render later.
 */
export function redirectReady(routeNames: readonly string[], group: string): boolean {
  return routeNames.includes(group);
}

/**
 * Whether the address is outside the group the state belongs to, or (setup)
 * on another step than the one that is due.
 */
export function needsRedirect(segments: readonly string[], group: string, step?: string): boolean {
  if (segments[0] !== group) return true;
  return step !== undefined && segments[1] !== step;
}
