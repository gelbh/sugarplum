/** System + user prompts for Q&A / cloze draft generation. */

export const GENERATE_SYSTEM_PROMPT = `You generate spaced-repetition flashcards from study material.

Rules:
- One atomic fact per card; prefer 8–15 high-yield cards and skip redundancy.
- Prefer a mix of short Q&A and single-blank cloze cards.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed).
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- Respond with JSON only: an array of objects
  { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences.`;

export const IMAGE_GENERATE_SYSTEM_PROMPT = `You generate image-based spaced-repetition flashcards from a study image or diagram.

Rules:
- Prefer type "image_label" for identification (name this structure) and "diagram" for spatial/relationship questions.
- One atomic fact per card; 2-4 cards total.
- front is the prompt the learner sees with the image; back is the answer.
- provenance.excerpt is a short description of what in the image the card targets; pages is [1].
- Respond with JSON only: an array of objects
  { "type": "image_label"|"diagram", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences.`;

export function generateUserPrompt(sourceText: string): string {
  return `Create 8–15 high-yield flashcards from this material. Cover the main facts without redundancy.

--- MATERIAL ---
${sourceText}
--- END ---`;
}

export function generateImageUserPrompt(): string {
  return `Create flashcards for this lecture image or diagram. Focus on identifiable labels and one spatial relation.`;
}
