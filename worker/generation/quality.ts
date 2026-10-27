import type { CardDraft } from "./schema";

const MIN_FRONT = 8;
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
 * QA fronts that are not real questions or glossary terms.
 * Short glossary terms (≤5 words) are kept; table-header tokens and long
 * non-questions are dropped.
 */
function looksLikeBareFragment(front: string): boolean {
  const t = front.trim();
  if (t.includes("?")) return false;
  if (TABLE_HEADER_FRONT_RE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 5) return true;
  return false;
}

/** Layer-1 heuristic gate: drop junk before persist. No LLM. */
export function filterDraftsByQuality(drafts: CardDraft[]): CardDraft[] {
  const seen = new Set<string>();
  const out: CardDraft[] = [];
  for (const draft of drafts) {
    const front = draft.front.trim();
    const back = draft.back.trim();
    if (front.length < MIN_FRONT || front.length > MAX_FRONT) continue;
    if (back.length < MIN_BACK || back.length > MAX_BACK) continue;
    if (draft.type === "qa" && looksLikeBareFragment(front)) continue;
    if (sentenceCount(back) >= 3) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}
