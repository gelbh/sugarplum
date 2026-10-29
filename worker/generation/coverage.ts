import type { CardDraft } from "./schema";

export type CoverageLedger = {
  covered: string[];
  gaps: string[];
  draft_count: number;
};

const GAP_LINE_MIN = 8;
const GAP_CAP = 20;
const COVERED_MAX = 80;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function draftParts(draft: CardDraft): string[] {
  const front =
    typeof draft.front === "string"
      ? draft.front
      : (draft.front.prompt ?? draft.front.image_key);
  const back =
    typeof draft.back === "string" ? draft.back : draft.back.answer;
  const excerpt = draft.provenance.excerpt;
  return [front, back, excerpt]
    .map((s) => normalizeWs(s).toLowerCase())
    .filter((s) => s.length > 0);
}

function coveredLabel(draft: CardDraft): string {
  const excerpt = draft.provenance.excerpt.slice(0, COVERED_MAX);
  if (excerpt) return excerpt;
  if (typeof draft.front === "string") return draft.front.slice(0, COVERED_MAX);
  return (draft.front.prompt ?? draft.front.image_key).slice(0, COVERED_MAX);
}

function lineIsCovered(line: string, drafts: CardDraft[]): boolean {
  const needle = normalizeWs(line).toLowerCase();
  if (!needle) return true;
  for (const draft of drafts) {
    for (const part of draftParts(draft)) {
      // Tiny parts as needles over-mark multi-fact lines.
      if (part.length >= GAP_LINE_MIN && needle.includes(part)) return true;
      // Excerpt often omits trailing punctuation vs the material line.
      if (part.includes(needle)) return true;
    }
  }
  return false;
}

/**
 * Build job coverage_json: survivor labels plus material lines not hit by any
 * draft front/back/excerpt (whitespace-normalized substring).
 */
export function buildCoverageLedger(
  material: string,
  drafts: CardDraft[],
): CoverageLedger {
  const covered = drafts.map(coveredLabel);

  const gaps: string[] = [];
  for (const raw of material.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < GAP_LINE_MIN) continue;
    if (!lineIsCovered(line, drafts)) {
      gaps.push(line);
      if (gaps.length >= GAP_CAP) break;
    }
  }

  return {
    covered,
    gaps,
    draft_count: drafts.length,
  };
}
