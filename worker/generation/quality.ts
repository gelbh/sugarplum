import type { CardDraft } from "./schema";

const MIN_FRONT = 8;
const MIN_GLOSSARY_FRONT = 3;
const MAX_FRONT = 240;
const MIN_BACK = 2;
const MAX_BACK = 400;

/** Table/slide header tokens: drop even when short glossary-shaped. */
const TABLE_HEADER_FRONT_RE =
  /^(phylum|hosts?|family|genus|class|order|species|disease|pathology|lifecycle|life cycle|symptoms?|treatment|diagnosis|notes?|definitive|significance|transmission|prevention|reservoir|vector|incubation|prognosis|etiology)$/i;

/** Front ending with a table-column label left as the "term". */
const TABLE_COLUMN_SUFFIX_RE =
  /\b(definitive|hosts?|significance|transmission|prevention|reservoir|vector|incubation|prognosis|etiology|family|genus|phylum|species|lifecycle|life cycle|symptoms?|treatment|diagnosis|notes?)$/i;

/** Incomplete / stub answers from table cells (non-question fronts). */
const STUB_BACK_RE =
  /^(depends on|multiple|mainly|various|variable|unknown|see (above|below|text)|n\/?a|tbd)$/i;

/** Yes/no stubs only when the front is not a question. */
const YES_NO_BACK_RE = /^(yes|no)$/i;

/** Preposition-led fragment fronts (lecture debris). */
const PREPOSITION_FRONT_RE =
  /^(to|into|in|on|at|from|of|for|with|by|via|as|per|during|after|before|between|among|over|under|through)\b/i;

/** Slide section headings (e.g. Pathogenesis in cattle). */
const SECTION_HEADER_FRONT_RE =
  /^(pathogenesis|epidemiology|etiology|clinical signs?|presentation|diagnosis|treatment|prevention|transmission|prognosis|pathology)\s+(in|of|for)\s+/i;

/** Filler stripped before tautology containment check. */
const TAUTOLOGY_BACK_LEAD_RE =
  /^(especially|mainly|primarily|particularly|often|usually|commonly|typically)\s+/i;

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Short non-question fronts that are glossary terms (not table headers or
 * long bare fragments). Glossary may use MIN_GLOSSARY_FRONT; others use
 * MIN_FRONT. QA glossary-shaped fronts are kept; table headers and long
 * non-questions are dropped.
 */
function isGlossaryShaped(front: string): boolean {
  const t = front.trim();
  if (t.includes("?")) return false;
  if (TABLE_HEADER_FRONT_RE.test(t)) return false;
  if (TABLE_COLUMN_SUFFIX_RE.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5;
}

function isFragmentFront(front: string): boolean {
  const t = front.trim();
  if (!t) return true;
  // Real questions are never lecture fragments (e.g. "In which organelle…?").
  if (t.includes("?")) return false;
  // Leading dash / bullet residue from slides.
  if (/^[\u2013\u2014\-\u2022*•]\s*/.test(t)) return true;
  if (PREPOSITION_FRONT_RE.test(t)) return true;
  // Multi-word phrase starting lowercase (not a proper term / question).
  // Single-word lowercase glossary terms (e.g. mitochondria) stay.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = t[0];
    if (
      first &&
      first === first.toLowerCase() &&
      first !== first.toUpperCase()
    ) {
      return true;
    }
  }
  return false;
}

function isIncompleteBack(front: string, back: string): boolean {
  const t = back.trim();
  if (STUB_BACK_RE.test(t)) return true;
  if (!front.includes("?") && YES_NO_BACK_RE.test(t)) return true;
  if (/\.\.\.|…\s*$/.test(t)) return true;
  if (/[,:;]\s*$/.test(t)) return true;
  return false;
}

/**
 * One-word alphabetic back with a non-question front (table cell).
 * Multi-word glossary fronts (e.g. "Capital of France | Paris") are exempt;
 * single-word front + single-word back (e.g. Cats/Chronic) still drops.
 */
function isGenericOneWordPair(front: string, back: string): boolean {
  if (front.includes("?")) return false;
  if (isGlossaryShaped(front) && wordCount(front) >= 2) return false;
  if (wordCount(back) !== 1) return false;
  // Single token with no digits; short category labels like Chronic, Multiple.
  return /^[A-Za-z][A-Za-z'-]*$/.test(back.trim());
}

function isSectionHeaderFront(front: string): boolean {
  if (front.includes("?")) return false;
  return SECTION_HEADER_FRONT_RE.test(front.trim());
}

/**
 * Slide section title used as a card with thin/stub debris back
 * (e.g. Pathogenesis in cattle / Females affected: abortion.).
 * Keeps real glossary fronts like Treatment of choice for X with a real answer.
 */
function isSectionHeaderDebris(front: string, back: string): boolean {
  if (!isSectionHeaderFront(front)) return false;
  if (isIncompleteBack(front, back)) return true;
  if (isThinOneWordGlossaryPair(front, back)) return true;
  // Short slide titles (≤3 words) with short debris backs (≤4 words).
  return wordCount(front) <= 3 && wordCount(back) <= 4;
}

/** One-word term with a one-token gloss (Inflammation.), not a real definition. */
function isThinOneWordGlossaryPair(front: string, back: string): boolean {
  if (!isGlossaryShaped(front) || wordCount(front) !== 1) return false;
  const token = back.trim().replace(/[.!?]+$/, "").trim();
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(token)) return false;
  return wordCount(back.replace(/[.!?]+$/, "")) === 1;
}

function normalizeContainment(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Answer echoes the question (lead-in filler or prepositional phrase only).
 * Does not use word-overlap ratios (those drop real either/or answers).
 */
function isTautologicalQa(front: string, back: string): boolean {
  if (!front.includes("?")) return false;
  const nf = normalizeContainment(front);
  const rawNb = normalizeContainment(back);
  if (rawNb.length < 6) return false;
  const hadLead = TAUTOLOGY_BACK_LEAD_RE.test(rawNb);
  const nb = rawNb.replace(TAUTOLOGY_BACK_LEAD_RE, "").trim();
  if (nb.length < 6 || !nf.includes(nb)) return false;
  if (hadLead) return true;
  return /^(in|on|at|of|for|with|to|from|via|among|between)\s+/.test(nb);
}

function hasBrokenPunctuation(back: string): boolean {
  const t = back.trim();
  // Starts with a closing curly double quote (e.g. ”Blackhead”.).
  // Apostrophes (’ / ') are contractions, not quote pairs.
  if (/^[”»]/.test(t)) return true;
  const straight = (t.match(/"/g) ?? []).length;
  if (straight % 2 !== 0) return true;
  const curlyOpen = (t.match(/[“«]/g) ?? []).length;
  const curlyClose = (t.match(/[”»]/g) ?? []).length;
  if (curlyOpen !== curlyClose) return true;
  return false;
}

function shouldDrop(draft: CardDraft, front: string, back: string): boolean {
  if (isIncompleteBack(front, back)) return true;
  if (hasBrokenPunctuation(back)) return true;
  // Table-column suffixes only on non-questions (avoid "What is the host?").
  if (!front.includes("?") && TABLE_COLUMN_SUFFIX_RE.test(front)) return true;
  if (draft.type === "qa" && isFragmentFront(front)) return true;
  if (draft.type === "qa" && isGenericOneWordPair(front, back)) return true;
  if (draft.type === "qa" && isSectionHeaderDebris(front, back)) return true;
  if (draft.type === "qa" && isThinOneWordGlossaryPair(front, back)) return true;
  if (draft.type === "qa" && isTautologicalQa(front, back)) return true;
  return false;
}

/** Layer-1 heuristic gate: drop junk before persist. No LLM. */
export function filterDraftsByQuality(drafts: CardDraft[]): CardDraft[] {
  const seen = new Set<string>();
  const out: CardDraft[] = [];
  for (const draft of drafts) {
    const front = draft.front.trim();
    const back = draft.back.trim();
    const glossary = isGlossaryShaped(front);
    const minFront = glossary ? MIN_GLOSSARY_FRONT : MIN_FRONT;
    if (front.length < minFront || front.length > MAX_FRONT) continue;
    if (back.length < MIN_BACK || back.length > MAX_BACK) continue;
    // Non-question QA that is not glossary-shaped is junk (header / fragment).
    if (draft.type === "qa" && !front.includes("?") && !glossary) continue;
    if (sentenceCount(back) >= 3) continue;
    if (shouldDrop(draft, front, back)) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}
