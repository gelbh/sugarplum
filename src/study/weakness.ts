import { frontPreviewFromJson } from "./frontPreview";

export type WeaknessCandidate = {
  id: string;
  deck_id: string;
  front_json: string;
  lapses: number;
  again_14d: number;
  hard_14d: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  retrievability: number | null;
};

export type WeaknessRow = {
  id: string;
  deck_id: string;
  front_preview: string;
  lapses: number;
  again_14d: number;
  hard_14d: number;
  difficulty: number;
  due: string;
  is_due: boolean;
  retrievability: number | null;
};

const DEFAULT_CAP = 50;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Weakness = again + 0.5*hard + lapses + 2*(1-R).clamp(0,1); null R → 0. */
export function weaknessScore(c: WeaknessCandidate): number {
  const rTerm =
    c.retrievability == null ? 0 : 2 * clamp01(1 - c.retrievability);
  return 1 * c.again_14d + 0.5 * c.hard_14d + 1 * c.lapses + rTerm;
}

/**
 * Rank struggling cards by weakness score; include any score > 0; cap 50.
 * Tie-break: difficulty desc, last_review asc.
 */
export function rankWeakness(
  rows: WeaknessCandidate[],
  nowIso: string,
  cap: number = DEFAULT_CAP,
): WeaknessRow[] {
  return rows
    .map((row) => ({ row, score: weaknessScore(row) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.row.difficulty !== a.row.difficulty) {
        return b.row.difficulty - a.row.difficulty;
      }
      const aReview = a.row.last_review ?? "";
      const bReview = b.row.last_review ?? "";
      return aReview.localeCompare(bReview);
    })
    .slice(0, cap)
    .map(({ row }) => ({
      id: row.id,
      deck_id: row.deck_id,
      front_preview: frontPreviewFromJson(row.front_json),
      lapses: row.lapses,
      again_14d: row.again_14d,
      hard_14d: row.hard_14d,
      difficulty: row.difficulty,
      due: row.due,
      is_due: row.due <= nowIso,
      retrievability: row.retrievability,
    }));
}
