import { encodeMcqAnswers, parseMcqAnswers } from "../study/mcqStudy";

export const MCQ_MIN = 3;
export const MCQ_MAX = 5;

export type McqDraft = {
  options: string[];
  /** Indices into `options` that are correct (unique, ascending). */
  correctIndices: number[];
  /** When false, UI is single-radio and at most one index is kept. */
  allowMultiple: boolean;
};

export function mcqBack(draft: McqDraft): string {
  const answers = draft.correctIndices
    .map((i) => draft.options[i])
    .filter((text): text is string => typeof text === "string");
  return encodeMcqAnswers(answers, draft.options);
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

export function correctIndicesFor(
  options: string[],
  back: string,
): number[] {
  const answers = parseMcqAnswers(back, options);
  if (answers.length === 0) {
    return [correctIndexFor(options, "")];
  }
  const indices: number[] = [];
  for (let i = 0; i < options.length; i++) {
    if (answers.includes(options[i]!.trim())) indices.push(i);
  }
  return indices.length > 0 ? indices : [correctIndexFor(options, "")];
}

function normalizeIndices(
  options: string[],
  indices: number[],
  allowMultiple: boolean,
): number[] {
  const unique = [
    ...new Set(
      indices.filter((i) => i >= 0 && i < options.length),
    ),
  ].sort((a, b) => a - b);
  if (unique.length === 0) {
    return [correctIndexFor(options, "")];
  }
  if (!allowMultiple) return [unique[0]!];
  return unique;
}

export function withMcqOptionText(
  draft: McqDraft,
  index: number,
  value: string,
): McqDraft {
  const options = [...draft.options];
  options[index] = value;
  return {
    options,
    correctIndices: normalizeIndices(
      options,
      draft.correctIndices,
      draft.allowMultiple,
    ),
    allowMultiple: draft.allowMultiple,
  };
}

export function withMcqCorrect(draft: McqDraft, index: number): McqDraft {
  if (index < 0 || index >= draft.options.length) return draft;
  if (!draft.allowMultiple) {
    return {
      options: draft.options,
      correctIndices: [index],
      allowMultiple: false,
    };
  }
  const has = draft.correctIndices.includes(index);
  const next = has
    ? draft.correctIndices.filter((i) => i !== index)
    : [...draft.correctIndices, index];
  return {
    options: draft.options,
    correctIndices: normalizeIndices(draft.options, next, true),
    allowMultiple: true,
  };
}

export function withMcqAllowMultiple(
  draft: McqDraft,
  allowMultiple: boolean,
): McqDraft {
  return {
    options: draft.options,
    correctIndices: normalizeIndices(
      draft.options,
      draft.correctIndices,
      allowMultiple,
    ),
    allowMultiple,
  };
}

export function withMcqOptionAdded(draft: McqDraft): McqDraft {
  if (draft.options.length >= MCQ_MAX) return draft;
  return {
    options: [...draft.options, ""],
    correctIndices: draft.correctIndices,
    allowMultiple: draft.allowMultiple,
  };
}

export function withMcqOptionRemoved(draft: McqDraft, index: number): McqDraft {
  if (draft.options.length <= MCQ_MIN) return draft;
  const options = draft.options.filter((_, i) => i !== index);
  const shifted = draft.correctIndices
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));
  return {
    options,
    correctIndices: normalizeIndices(options, shifted, draft.allowMultiple),
    allowMultiple: draft.allowMultiple,
  };
}
