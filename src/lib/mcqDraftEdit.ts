export const MCQ_MIN = 3;
export const MCQ_MAX = 5;

export type McqDraft = { options: string[]; correctIndex: number };

export function mcqBack(draft: McqDraft): string {
  return draft.options[draft.correctIndex] ?? "";
}

export function pickCorrect(options: string[], preferred: string): string {
  const trimmed = preferred.trim();
  if (trimmed && options.includes(trimmed)) return trimmed;
  return options.find((o) => o.trim()) ?? options[0] ?? "";
}

export function correctIndexFor(options: string[], preferred: string): number {
  const trimmed = preferred.trim();
  if (trimmed) {
    const i = options.findIndex((o) => o === preferred || o === trimmed);
    if (i >= 0) return i;
  }
  const nonEmpty = options.findIndex((o) => o.trim());
  return nonEmpty >= 0 ? nonEmpty : 0;
}

export function withMcqOptionText(
  draft: McqDraft,
  index: number,
  value: string,
): McqDraft {
  const options = [...draft.options];
  options[index] = value;
  return { options, correctIndex: draft.correctIndex };
}

export function withMcqCorrect(draft: McqDraft, index: number): McqDraft {
  if (index < 0 || index >= draft.options.length) return draft;
  return { options: draft.options, correctIndex: index };
}

export function withMcqOptionAdded(draft: McqDraft): McqDraft {
  if (draft.options.length >= MCQ_MAX) return draft;
  return { options: [...draft.options, ""], correctIndex: draft.correctIndex };
}

export function withMcqOptionRemoved(draft: McqDraft, index: number): McqDraft {
  if (draft.options.length <= MCQ_MIN) return draft;
  const options = draft.options.filter((_, i) => i !== index);
  let correctIndex = draft.correctIndex;
  if (index === draft.correctIndex) {
    correctIndex = correctIndexFor(options, "");
  } else if (index < draft.correctIndex) {
    correctIndex -= 1;
  }
  return { options, correctIndex };
}
