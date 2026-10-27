import type { CardDraft } from "./schema";

const MIN_FRONT = 8;
const MIN_GLOSSARY_FRONT = 3;
const MAX_FRONT = 240;
const MIN_BACK = 2;
const MAX_BACK = 400;

/** Table/slide header tokens: drop even when short glossary-shaped. */
const TABLE_HEADER_FRONT_RE =
  /^(phylum|hosts?|family|genus|class|order|species|disease|pathology|lifecycle|life cycle|symptoms?|treatment|diagnosis|notes?)$/i;

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
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
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5;
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
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}
