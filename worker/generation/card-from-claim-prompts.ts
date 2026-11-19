import type { StudyClaim } from "./claims";

/** System prompt: write ≤1 short flashcard per StudyClaim. */
export const CARD_FROM_CLAIM_SYSTEM_PROMPT = `You write spaced-repetition flashcards from atomic study claims.

Rules:
- At most one card per claim. Omit a claim if it cannot make a good grounded card.
- Prefer type "qa". Use single-blank cloze when the claim object is a short high-info span. Use "mcq" only when the claim source_span already lists a closed option set.
- Keep front/back under ~25 words. No essay backs.
- No compound stems: do not ask "and what/which/how/why", do not use versus-paired multi-fact questions.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks. Cloze Extra (back) is optional: use "" when unused.
- For type "mcq": front is a single-fact question; back is the correct option (must appear in options); options is a unique array of 3–5 strings including back. Every distractor must come from the claim source_span; do not invent trivia.
- provenance.excerpt must equal the claim source_span (verbatim; whitespace normalization OK). pages from the claim or [1].
- Respond with JSON only: an array of objects
  { "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

/**
 * Compact write after mid-JSON truncation: fewer, shorter cards.
 * System and user must agree on ~3 cards (do not reuse CARD_FROM_CLAIM_SYSTEM_PROMPT).
 */
export const CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT = `You write spaced-repetition flashcards from atomic study claims.

Rules:
- At most one card per claim. Produce at most 3 short cards; omit weak claims.
- Prefer type "qa". Use single-blank cloze when the claim object is a short high-info span. Use "mcq" only when the claim source_span already lists a closed option set.
- Keep front/back under ~15 words. No essay backs.
- No compound stems: do not ask "and what/which/how/why", do not use versus-paired multi-fact questions.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks. Cloze Extra (back) is optional: use "" when unused.
- For type "mcq": front is a single-fact question; back is the correct option (must appear in options); options is a unique array of 3–5 strings including back. Every distractor must come from the claim source_span; do not invent trivia.
- provenance.excerpt must equal the claim source_span (verbatim; whitespace normalization OK). pages from the claim or [1].
- Respond with JSON only: {"cards":[ { "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function cardFromClaimUserPrompt(claims: StudyClaim[]): string {
  return `Write at most one short flashcard per claim. Prefer qa; use cloze for short high-info objects; mcq only for a closed option set already in the source_span. Keep front/back under ~25 words. No compound stems. Omit weak claims.

Claims (JSON):
${JSON.stringify(claims)}

Return JSON as a card array (or {"cards":[...]}). Finish every string and close all braces.`;
}

export function cardFromClaimCompactUserPrompt(claims: StudyClaim[]): string {
  return `Write at most 3 short flashcards from these claims (one per claim max). Prefer qa; keep front/back under 15 words. Omit weak claims. Respond with JSON only as {"cards":[...]}. Finish every string and close all braces.

Claims (JSON):
${JSON.stringify(claims)}`;
}
