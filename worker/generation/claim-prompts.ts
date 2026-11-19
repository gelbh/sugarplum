/** System prompt: extract atomic StudyClaims from a lecture chunk. */
export const CLAIM_EXTRACT_SYSTEM_PROMPT = `You extract atomic study claims from lecture or notes material.

Rules:
- Each claim is one atomic assertion: subject + predicate (+ optional object / qualifiers). Prefer 6–12 solid claims; fewer solid beats trivia.
- Only source-grounded verifiable facts. Skip speculation, hedging, and incomplete fragments.
- Resolve pronouns (it, they, this, these, those) to the named entity using the chunk; never leave a pronoun as subject.
- Split compounds: if a sentence asserts two predicates or joins two facts with "and" / "versus", emit two claims.
- Skip document learning-objective lists, tables of contents, references, slide chrome, and prefaces.
- source_span must be a short verbatim span from the material that entails the claim (whitespace normalization OK; do not drop or rephrase words).
- pages is optional 1-based page numbers when known; omit when unknown.
- Respond with JSON only: {"claims":[ { "subject": string, "predicate": string, "object"?: string, "qualifiers"?: string[], "source_span": string, "pages"?: number[] } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

/**
 * Compact extract after mid-JSON truncation: fewer claims.
 * System and user must agree on ~3–5 (do not reuse CLAIM_EXTRACT_SYSTEM_PROMPT).
 */
export const CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT = `You extract atomic study claims from lecture or notes material.

Rules:
- Each claim is one atomic assertion: subject + predicate (+ optional object / qualifiers). Produce 3–5 solid claims only.
- Only source-grounded verifiable facts. Skip speculation, hedging, and incomplete fragments.
- Resolve pronouns (it, they, this, these, those) to the named entity using the chunk; never leave a pronoun as subject.
- Split compounds: if a sentence asserts two predicates or joins two facts with "and" / "versus", emit two claims.
- Skip document learning-objective lists, tables of contents, references, slide chrome, and prefaces.
- source_span must be a short verbatim span from the material that entails the claim (whitespace normalization OK; do not drop or rephrase words).
- pages is optional 1-based page numbers when known; omit when unknown.
- Respond with JSON only: {"claims":[ { "subject": string, "predicate": string, "object"?: string, "qualifiers"?: string[], "source_span": string, "pages"?: number[] } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function claimExtractUserPrompt(sourceText: string): string {
  return `Extract 6–12 atomic claims from this material. Resolve pronouns. Split compounds into separate claims. Skip learning-objective lists, contents, references, and slide chrome. Prefer fewer solid claims over trivia.

--- MATERIAL ---
${sourceText}
--- END ---

Respond with JSON only as {"claims":[...]}. Finish every string and close all braces.`;
}

export function claimExtractCompactUserPrompt(sourceText: string): string {
  return `Extract 3–5 atomic claims from this material. Resolve pronouns. Split compounds. Skip chrome and weak facts. Respond with JSON only as {"claims":[...]}. Finish every string and close all braces.

--- MATERIAL ---
${sourceText}
--- END ---`;
}

/** Gap pass: no 6–12 preference; cover every remaining solid fact on listed lines. */
export const CLAIM_GAP_EXTRACT_SYSTEM_PROMPT = `You extract atomic study claims from uncovered lecture or notes lines.

Rules:
- Each claim is one atomic assertion: subject + predicate (+ optional object / qualifiers).
- Extract every remaining solid study claim from the listed uncovered lines. Do not stop early for a count target. Skip only chrome, trivia, speculation, hedging, and incomplete fragments.
- Resolve pronouns (it, they, this, these, those) to the named entity using the lines; never leave a pronoun as subject.
- Split compounds: if a sentence asserts two predicates or joins two facts with "and" / "versus", emit two claims.
- Skip document learning-objective lists, tables of contents, references, slide chrome, and prefaces.
- source_span must be a short verbatim span from the uncovered lines that entails the claim (whitespace normalization OK; do not drop or rephrase words).
- pages is optional 1-based page numbers when known; omit when unknown.
- Respond with JSON only: {"claims":[ { "subject": string, "predicate": string, "object"?: string, "qualifiers"?: string[], "source_span": string, "pages"?: number[] } ]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function claimGapExtractUserPrompt(uncoveredLines: string[]): string {
  const body = uncoveredLines.join("\n");
  return `These note lines are still unclaimed. Extract every remaining solid study claim from them. Resolve pronouns. Split compounds. Skip chrome and weak facts. Do not limit yourself to 6–12 claims.

--- UNCOVERED LINES ---
${body}
--- END ---

Respond with JSON only as {"claims":[...]}. Finish every string and close all braces.`;
}
