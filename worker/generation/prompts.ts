/** System + user prompts for Q&A / cloze draft generation. */

export const GENERATE_SYSTEM_PROMPT = `You generate spaced-repetition flashcards from study material.

Rules:
- One atomic fact per card; prefer 8–12 high-yield cards and skip redundancy.
- Cover distinct grounded facts; do not collapse multiple facts into one card.
- One organism per card; do not AND-merge adjacent table cells that name distinct species into one stem/answer.
- Front taxon must be supported by the cited excerpt; skip misattributed table-row answers.
- Only create cards clearly grounded in the source excerpt; skip weak, incomplete, speculative, or table-debris facts. Prefer fewer solid cards over inventing answers.
- Prefer a mix of short Q&A, single-blank cloze, and multiple-choice (mcq) cards when a short option set fits the excerpt.
- Keep front/back under ~25 words; provenance.excerpt under ~12 words.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Cloze: blank a high-yield fact (organ, route, drug, species distinction), never the topic genus the sentence is already about.
- Cloze Extra (back) is optional: use "" when unused. Study answer comes from the {{c1::…}} blank, not Extra. Extra may equal the cloze answer when present (Anki-normal).
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed). Answers must be entailed by that excerpt.
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- For type "mcq": front is a single-fact question; back is the correct option (must appear in options); options is a unique array of 3–5 strings including back. Every distractor must be entailed by or clearly present in the cited excerpt; do not invent trivia or plausible-but-ungrounded wrong answers. Drop multi-species AND stems that require two different species.
- Respond with JSON only: an array of objects
  { "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } }
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export const IMAGE_GENERATE_SYSTEM_PROMPT = `You generate image-based spaced-repetition flashcards from a study image or diagram.

Rules:
- Prefer type "occlusion" when the image has clear labelled structures (anatomy plates, maps, process diagrams with callouts). Propose 1–8 regions with boxes normalized 0–1 (x,y,w,h relative to image width/height).
- Still allow "image_label" for simple identification and "diagram" for spatial/relationship questions when occlusion does not fit.
- One atomic fact per card; 2-4 cards total.
- Only create cards clearly grounded in what the image shows; skip weak, speculative, or incomplete labels. Prefer fewer solid cards over inventing answers.
- For occlusion: front is { "image_key": string, "prompt"?: string, "regions": [{ "id", "x", "y", "w", "h", "label" }], "mode": "hide_one" }; back is { "answer": string } (region label or short explanation). image_key must equal the material key in the user message. Region ids are stable short strings (r1, r2, …).
- For image_label/diagram: front is the prompt the learner sees with the image; back is the answer string.
- provenance.excerpt is a short description of what in the image the card targets; pages is [1].
- Respond with JSON only: an array of objects of one of:
  { "type": "occlusion", "front": {…}, "back": { "answer": string }, "provenance": { "pages": number[], "excerpt": string } }
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
- Cover distinct grounded facts; do not collapse multiple facts into one card.
- One organism per card; do not AND-merge adjacent table cells that name distinct species into one stem/answer.
- Front taxon must be supported by the cited excerpt; skip misattributed table-row answers.
- Only create cards clearly grounded in the source excerpt; skip weak, incomplete, speculative, or table-debris facts. Prefer fewer solid cards over inventing answers.
- Prefer a mix of short Q&A, single-blank cloze, and multiple-choice (mcq) cards when a short option set fits the excerpt.
- Keep front/back under ~15 words; provenance.excerpt under ~12 words.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Cloze: blank a high-yield fact (organ, route, drug, species distinction), never the topic genus the sentence is already about.
- Cloze Extra (back) is optional: use "" when unused. Study answer comes from the {{c1::…}} blank, not Extra. Extra may equal the cloze answer when present (Anki-normal).
- Every card must cite a short excerpt from the source (verbatim or lightly trimmed). Answers must be entailed by that excerpt.
- pages is a list of 1-based page numbers when known; use [1] for plain text pastes.
- For type "mcq": front is a single-fact question; back is the correct option (must appear in options); options is a unique array of 3–5 strings including back. Every distractor must be entailed by or clearly present in the cited excerpt; do not invent trivia or plausible-but-ungrounded wrong answers. Drop multi-species AND stems that require two different species.
- Respond with JSON only: {"cards":[ { "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function generateCompactUserPrompt(sourceText: string): string {
  return `Create 3–5 short high-yield flashcards from this material. Keep each front/back under 15 words. Skip anything not clearly grounded. Respond with JSON only as {"cards":[...]}. Finish every string and close all braces.

--- MATERIAL ---
${sourceText}
--- END ---`;
}

export function generateImageUserPrompt(imageKey: string): string {
  return `Create flashcards for this lecture image or diagram. Prefer occlusion with 1–8 labelled regions when structures are clearly labelled. Use image_key "${imageKey}". Region x,y,w,h are normalized 0–1. Allow image_label / diagram when occlusion does not fit. Skip anything not clearly visible or grounded in the image.`;
}

/** Optional generate-prompt suffix when the job has topic hints. */
export function topicHintsPromptSuffix(hints: string[]): string {
  if (hints.length === 0) return "";
  return `You must attempt cards covering each of these topics if grounded in the material; do not invent ungrounded facts: ${hints.join("; ")}.`;
}

/** Append topic-hints instruction to a generate user prompt when hints are present. */
export function appendTopicHintsSuffix(
  prompt: string,
  hints: string[],
): string {
  const suffix = topicHintsPromptSuffix(hints);
  return suffix ? `${prompt}\n\n${suffix}` : prompt;
}
