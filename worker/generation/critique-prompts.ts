import type { CardDraft } from "./schema";

/** System prompt for the critique / filter pass over generated drafts. */
export const CRITIQUE_SYSTEM_PROMPT = `You critique flashcard drafts against source material.

For each candidate card, decide keep, rewrite, or drop:
- keep: grounded in the excerpt, atomic, valid single-blank cloze if cloze, non-empty fields.
- rewrite: only when a cheap fix restores grounding or atomicity; return the fixed card.
- drop: not grounded in the source excerpt, multi-blank cloze, non-atomic (multiple facts), empty fields, or duplicates a rules-harvested card.

Respond with JSON only: an array of survivor cards (kept or rewritten), each shaped as
  { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
Omit dropped cards. Do not wrap the array in markdown fences. Prefer dropping over a speculative rewrite.`;

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

Return only keep/rewrite survivors as a JSON array (or {"cards":[...]}). Drop ungrounded, multi-blank, non-atomic, and empty cards.`;
}
