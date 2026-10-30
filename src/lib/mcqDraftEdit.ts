export const MCQ_MIN = 3;
export const MCQ_MAX = 5;

export type McqDraft = { options: string[]; back: string };

export function pickCorrect(options: string[], preferred: string): string {
  const trimmed = preferred.trim();
  if (trimmed && options.includes(trimmed)) return trimmed;
  return options.find((o) => o.trim()) ?? options[0] ?? "";
}

export function withMcqOptionText(
  draft: McqDraft,
  index: number,
  value: string,
): McqDraft {
  const options = [...draft.options];
  const wasCorrect = draft.back === options[index];
  options[index] = value;
  return { options, back: wasCorrect ? value : draft.back };
}

export function withMcqCorrect(draft: McqDraft, index: number): McqDraft {
  return { options: draft.options, back: draft.options[index] ?? "" };
}

export function withMcqOptionAdded(draft: McqDraft): McqDraft {
  if (draft.options.length >= MCQ_MAX) return draft;
  return { options: [...draft.options, ""], back: draft.back };
}

export function withMcqOptionRemoved(draft: McqDraft, index: number): McqDraft {
  if (draft.options.length <= MCQ_MIN) return draft;
  const removed = draft.options[index];
  const options = draft.options.filter((_, i) => i !== index);
  const back = draft.back === removed ? pickCorrect(options, "") : draft.back;
  return { options, back };
}
