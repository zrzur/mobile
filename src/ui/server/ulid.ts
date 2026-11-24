const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new ULID (26 characters, time first), as the web makes category ids (web: ulid()) */
export function newUlid(now: number, random: () => number): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rest = "";
  for (let i = 0; i < 16; i++) rest += CROCKFORD[Math.floor(random() * 32) % 32];
  return time + rest;
}

/** Time for a closing sheet to leave before the next window opens (iOS) */
export const MODAL_GAP = 350;
