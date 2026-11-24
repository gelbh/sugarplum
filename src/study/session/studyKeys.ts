import type { StudyRating } from "../../api/client";

/** Arrows mirror swipe directions (← No Idea · ↓ Tough Cookie · → Good Enough · ↑ Easy Peasy). */
export const GRADE_BINDINGS: readonly {
  rating: StudyRating;
  digit: string;
  arrow: string;
  arrowName: string;
}[] = [
  { rating: 1, digit: "1", arrow: "ArrowLeft", arrowName: "left arrow" },
  { rating: 2, digit: "2", arrow: "ArrowDown", arrowName: "down arrow" },
  { rating: 3, digit: "3", arrow: "ArrowRight", arrowName: "right arrow" },
  { rating: 4, digit: "4", arrow: "ArrowUp", arrowName: "up arrow" },
];

const GRADE_KEYS = new Map<string, StudyRating>(
  GRADE_BINDINGS.flatMap((b) => [
    [b.digit, b.rating],
    [b.arrow, b.rating],
  ]),
);

export type StudyKeyAction =
  | { type: "reveal" }
  | { type: "hide" }
  | { type: "grade"; rating: StudyRating }
  | { type: "none" };

/** Flip-card keys (Q&A, cloze, occlusion). MCQ uses `mcqOptionIndexForKey`. */
export function resolveStudyKey(
  key: string,
  revealed: boolean,
): StudyKeyAction {
  if (key === " ") return { type: revealed ? "hide" : "reveal" };
  const rating = GRADE_KEYS.get(key);
  if (rating && revealed) return { type: "grade", rating };
  return { type: "none" };
}

const MCQ_KEY_LIMIT = 9;

/** MCQ: digit n picks the nth displayed option; null when out of range. */
export function mcqOptionIndexForKey(
  key: string,
  optionCount: number,
): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < optionCount ? index : null;
}

export function mcqOptionKey(index: number): string | null {
  return index < MCQ_KEY_LIMIT ? String(index + 1) : null;
}

const TYPING = "input, textarea, select, [contenteditable='true']";

/** Study shortcut key, or null for repeats, modifier combos and typing targets. */
export function plainShortcutKey(e: {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): string | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.target instanceof Element && e.target.closest(TYPING)) return null;
  return e.key;
}

const REVIEW_PORTAL =
  '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]';

/** Draft review arrows: body or inside the stage. Typing targets and portaled widgets do not decide. */
export function reviewArrowDecision(
  e: {
    key: string;
    repeat: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  active: Element | null,
  stage: Element | null,
): "accept" | "reject" | null {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return null;
  if (e.shiftKey) return null;
  if (plainShortcutKey({ ...e, target: active }) === null) return null;
  if (active?.closest(REVIEW_PORTAL)) return null;
  const atRest =
    active === null ||
    active === document.body ||
    active === document.documentElement;
  if (!atRest && (stage === null || !stage.contains(active))) return null;
  return e.key === "ArrowRight" ? "accept" : "reject";
}

/** Up/Down scroll an overflowing answer until it hits that edge, then grade. */
export function faceScrollsFor(
  key: string,
  face: { scrollTop: number; clientHeight: number; scrollHeight: number } | null,
): boolean {
  if (!face) return false;
  if (key === "ArrowUp") return face.scrollTop > 0;
  if (key === "ArrowDown") {
    return face.scrollTop + face.clientHeight < face.scrollHeight - 1;
  }
  return false;
}
