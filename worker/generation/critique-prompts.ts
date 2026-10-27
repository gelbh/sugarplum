import type { CardDraft } from "./schema";

/** System prompt for the critique / filter pass over generated drafts. */
export const CRITIQUE_SYSTEM_PROMPT = `You critique flashcard drafts against source material.

For each candidate card, decide keep, rewrite, or drop. Prefer drop over rewrite when grounding is weak, the answer is incomplete, or the question misframes the excerpt.

- keep: clearly grounded in the excerpt, atomic, valid single-blank cloze if cloze, valid mcq if mcq (3–5 unique options, back is one of them, every option grounded in the excerpt), non-empty fields. Cloze back may equal the cloze answer (Anki-normal); do not drop solely for that.
- rewrite: only for cheap fixes (trim, single-blank cloze repair, tighten atomicity, mcq stem/option wording) when the fact is clearly entailed by the excerpt; return the fixed card. Do not speculate.
- drop: ungrounded or not entailed by the cited excerpt; table-row debris; fragment fronts; incomplete answers; multi-blank cloze; non-atomic (multiple facts); empty fields; duplicates a rules-harvested card; or the answer restates the question or adds no new fact beyond what the excerpt already states in the front. For mcq: drop if any distractor is not entailed by or clearly present in the cited material; if the stem is ambiguous; if back is missing from options; if option count is not 3–5 or options duplicate.

Respond with JSON only: an array of survivor cards (kept or rewritten), each shaped as
  { "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } }
Omit dropped cards. Do not wrap the array in markdown fences. Prefer drop over a speculative rewrite.`;

export function critiqueUserPrompt(
  sourceText: string,
  candidates: CardDraft[],
): string {
  return `Source material:
--- MATERIAL ---
${sourceText}
--- END ---

Candidate cards (JSON):
${JSON.stringify(candidates)}

Return only keep/rewrite survivors as a JSON array (or {"cards":[...]}). Prefer drop when grounding is weak, the answer is incomplete, the front is a fragment / table-row debris, or the answer restates the question or adds no new fact from the excerpt. Drop cards not entailed by the excerpt. For mcq, drop ungrounded distractors, ambiguous stems, or when the correct answer is not among the options. Rewrite only cheap fixes; do not speculate. Cloze back may equal the cloze answer.`;
}
