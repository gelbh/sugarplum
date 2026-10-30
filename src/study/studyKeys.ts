import type { StudyRating } from "../api/client";

export type StudyKeyAction =
  | { type: "flip" }
  | { type: "grade"; rating: StudyRating }
  | { type: "none" };

/** Arrows mirror swipe directions (← Again · ↓ Hard · → Good · ↑ Easy). */
const GRADE_KEYS: Record<string, StudyRating> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  ArrowLeft: 1,
  ArrowDown: 2,
  ArrowRight: 3,
  ArrowUp: 4,
};

/** Flip-card keys (Q&A, cloze, occlusion). MCQ uses `mcqOptionIndexForKey`. */
export function resolveStudyKey(
  key: string,
  revealed: boolean,
): StudyKeyAction {
  if (key === " ") return { type: "flip" };
  const rating = GRADE_KEYS[key];
  if (rating && revealed) return { type: "grade", rating };
  return { type: "none" };
}

/** MCQ: digit n picks the nth displayed option; null when out of range. */
export function mcqOptionIndexForKey(
  key: string,
  optionCount: number,
): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < optionCount ? index : null;
}

const INTERACTIVE =
  "button, a[href], input, textarea, select, [contenteditable='true'], [role='button']";

/** Focused native controls keep their own Space activation. */
export function isInteractiveKeyTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

export function hasShortcutModifier(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}
