import type { StudyRating } from "../api/client";

/** Joins several correct MCQ answers in `back` (forbidden inside option text). */
export const MCQ_ANSWER_SEP = "\u001f";

/** Correct answers from `back`, ordered as in `options`. Legacy single-answer backs stay one entry. */
export function parseMcqAnswers(back: string, options: string[]): string[] {
  const optionSet = new Set(options.map((o) => o.trim()).filter(Boolean));
  const raw = back.includes(MCQ_ANSWER_SEP)
    ? back.split(MCQ_ANSWER_SEP)
    : [back];
  const selected = new Set(
    raw.map((part) => part.trim()).filter((part) => optionSet.has(part)),
  );
  return options
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && selected.has(o));
}

/** Encode correct answers in options order. One answer → plain string (legacy shape). */
export function encodeMcqAnswers(
  correctOptions: string[],
  options: string[],
): string {
  const wanted = new Set(
    correctOptions.map((o) => o.trim()).filter(Boolean),
  );
  const ordered = options
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && wanted.has(o));
  return ordered.join(MCQ_ANSWER_SEP);
}

export function mcqAnswersEqual(
  selected: string[],
  correct: string[],
): boolean {
  const a = new Set(selected.map((s) => s.trim()).filter(Boolean));
  const b = new Set(correct.map((s) => s.trim()).filter(Boolean));
  if (a.size === 0 || a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/** Multi-select Check → FSRS Again (1) or Good (3). */
export function mcqSetRating(
  selected: string[],
  correct: string[],
): StudyRating {
  return mcqAnswersEqual(selected, correct) ? 3 : 1;
}

/** ponytail: FNV-1a seed is fine for option shuffle; swap to crypto if order must be unpredictable. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable shuffle for one card view (keyed by card id). */
export function shuffledMcqOptions(
  cardId: string,
  options: string[],
): string[] {
  const copy = [...options];
  const rand = mulberry32(hashSeed(cardId));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Binary MCQ tap → FSRS Again (1) or Good (3). */
export function mcqTapRating(
  selected: string,
  correctAnswer: string,
): StudyRating {
  return selected.trim() === correctAnswer.trim() ? 3 : 1;
}

/**
 * Whether an MCQ choice Button should use MUI `disabled`.
 * Feedback lock must stay enabled: dark-scheme `action.disabled` paints
 * light text/borders on the ivory card face.
 */
export function mcqOptionButtonDisabled(
  parentDisabled: boolean | undefined,
  _feedbackLocked: boolean,
): boolean {
  return Boolean(parentDisabled);
}
