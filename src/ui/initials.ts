/**
 * Initials as the web draws them (web Initials.tsx): the first letter of each
 * word, at most two. An Arabic word is known by the letter after its definite
 * article («الأصدقاء» gives «أ»), vowel marks and tatweel are dropped, and
 * Arabic letters are kept apart with a zero-width non-joiner so «م أ» does not
 * join into a word.
 */
const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿ]/u;
const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ​-‏‪-‮⁠-⁩]/gu;

function firstLetter(word: string) {
  const letters = Array.from(word.replace(MARKS, ""));
  if (letters.length > 3 && letters[0] === "ا" && letters[1] === "ل" && ARABIC_LETTER.test(letters[2])) return letters[2];
  return letters[0];
}

export function toInitials(input: string, maxLength = 2): string[] {
  return input
    .trim()
    .split(/\s+/)
    .map(firstLetter)
    .filter((x): x is string => !!x)
    .slice(0, maxLength);
}

export function initialsText(input: string, maxLength = 2): string {
  const letters = toInitials(input, maxLength);
  return letters.join(letters.some((x) => ARABIC_LETTER.test(x)) ? "‌" : "");
}
