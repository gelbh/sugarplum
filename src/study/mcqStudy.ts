import type { StudyRating } from "../api/client";

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
