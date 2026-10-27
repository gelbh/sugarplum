/** System + user prompts for Q&A / cloze draft generation. */

export const GENERATE_SYSTEM_PROMPT = `You generate spaced-repetition flashcards from study material.

Rules:
- One atomic fact per card; prefer 8–12 high-yield cards and skip redundancy.
- Only create cards clearly grounded in the source excerpt; skip weak, incomplete, speculative, or table-debris facts. Prefer fewer solid cards over inventing answers.
- Prefer a mix of short Q&A and single-blank cloze cards.
- Keep front/back under ~25 words; provenance.excerpt under ~12 words.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Cloze back may equal the cloze answer (Anki-normal).
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed). Answers must be entailed by that excerpt.
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- Respond with JSON only: an array of objects
  { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export const IMAGE_GENERATE_SYSTEM_PROMPT = `You generate image-based spaced-repetition flashcards from a study image or diagram.

Rules:
- Prefer type "image_label" for identification (name this structure) and "diagram" for spatial/relationship questions.
- One atomic fact per card; 2-4 cards total.
- Only create cards clearly grounded in what the image shows; skip weak, speculative, or incomplete labels. Prefer fewer solid cards over inventing answers.
- front is the prompt the learner sees with the image; back is the answer.
- provenance.excerpt is a short description of what in the image the card targets; pages is [1].
- Respond with JSON only: an array of objects
  { "type": "image_label"|"diagram", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences.`;

export function generateUserPrompt(sourceText: string): string {
  return `Create 8–12 high-yield flashcards from this material. Cover the main facts without redundancy. Keep each card short. Skip anything not clearly grounded in the material.

--- MATERIAL ---
${sourceText}
--- END ---`;
}

/**
 * Compact generate pass after mid-JSON truncation: fewer, shorter cards.
 * System and user must agree on 3–5 (do not reuse GENERATE_SYSTEM_PROMPT).
 */
export const GENERATE_COMPACT_SYSTEM_PROMPT = `You generate spaced-repetition flashcards from study material.

Rules:
- One atomic fact per card; produce 3–5 high-yield cards only and skip redundancy.
- Only create cards clearly grounded in the source excerpt; skip weak, incomplete, speculative, or table-debris facts. Prefer fewer solid cards over inventing answers.
- Prefer a mix of short Q&A and single-blank cloze cards.
- Keep front/back under ~15 words; provenance.excerpt under ~12 words.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Cloze back may equal the cloze answer (Anki-normal).
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed). Answers must be entailed by that excerpt.
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- Respond with JSON only: {"cards":[ { "type": "qa"|"cloze", "front": string, "back": string, "provenance": { "pages": number[], "excerpt": string } } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function generateCompactUserPrompt(sourceText: string): string {
  return `Create 3–5 short high-yield flashcards from this material. Keep each front/back under 15 words. Skip anything not clearly grounded. Respond with JSON only as {"cards":[...]}. Finish every string and close all braces.

--- MATERIAL ---
${sourceText}
--- END ---`;
}

export function generateImageUserPrompt(): string {
  return `Create flashcards for this lecture image or diagram. Focus on identifiable labels and one spatial relation. Skip anything not clearly visible or grounded in the image.`;
}
