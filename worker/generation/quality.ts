import type { CardDraft } from "./schema";

const MIN_FRONT = 8;
const MAX_FRONT = 240;
const MIN_BACK = 2;
const MAX_BACK = 400;

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function looksLikeBareFragment(front: string): boolean {
  const t = front.trim();
  if (t.includes("?")) return false;
  const words = t.split(/\s+/).filter(Boolean);
  // Bare glossary term (≤5 words) is OK if short; single table-header token is not.
  if (words.length === 1 && t.length < 16) return true;
  if (words.length > 5 && !t.includes("?")) return true;
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
