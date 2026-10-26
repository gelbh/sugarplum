/** System + user prompts for Q&A / cloze draft generation. */

export const GENERATE_SYSTEM_PROMPT = `You generate spaced-repetition flashcards from study material.

Rules:
- One atomic fact per card.
- Prefer a mix of short Q&A and single-blank cloze cards.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed).
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- Respond with JSON only: an array of objects
  { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences.`;

export function generateUserPrompt(sourceText: string): string {
  return `Create flashcards from this material. Cover the main facts without redundancy.

--- MATERIAL ---
${sourceText}
--- END ---`;
}
