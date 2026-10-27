import type { CardDraft } from "./schema";

/** System prompt for the critique / filter pass over generated drafts. */
export const CRITIQUE_SYSTEM_PROMPT = `You critique flashcard drafts against source material.

For each candidate card, decide keep, rewrite, or drop. Prefer drop over rewrite when grounding is weak, the answer is incomplete, or the question misframes the excerpt.

- keep: clearly grounded in the excerpt, atomic, valid single-blank cloze if cloze, non-empty fields. Cloze back may equal the cloze answer (Anki-normal); do not drop solely for that.
- rewrite: only for cheap fixes (trim, single-blank cloze repair, tighten atomicity) when the fact is clearly entailed by the excerpt; return the fixed card. Do not speculate.
- drop: ungrounded or not entailed by the cited excerpt; table-row debris; fragment fronts; incomplete answers; multi-blank cloze; non-atomic (multiple facts); empty fields; or duplicates a rules-harvested card.

Respond with JSON only: an array of survivor cards (kept or rewritten), each shaped as
  { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
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

Return only keep/rewrite survivors as a JSON array (or {"cards":[...]}). Prefer drop when grounding is weak, the answer is incomplete, or the front is a fragment / table-row debris. Drop cards not entailed by the excerpt. Rewrite only cheap fixes; do not speculate. Cloze back may equal the cloze answer.`;
}
