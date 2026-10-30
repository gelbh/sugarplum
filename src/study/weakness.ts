const PREVIEW_LEN = 120;

/** First ~120 chars of front text/prompt from stored front_json. */
function frontPreviewFromJson(frontJson: string): string {
  let text = frontJson;
  try {
    const parsed: unknown = JSON.parse(frontJson);
    if (typeof parsed === "string") {
      text = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.text === "string") text = obj.text;
      else if (typeof obj.prompt === "string") text = obj.prompt;
      else text = JSON.stringify(parsed);
    }
  } catch {
    // keep raw string
  }
  return text.slice(0, PREVIEW_LEN);
}

export type WeaknessCandidate = {
  id: string;
  deck_id: string;
  type: string;
  front_json: string;
  lapses: number;
  again_14d: number;
  hard_14d: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  retrievability: number | null;
};

export type WeaknessRow<T extends WeaknessCandidate = WeaknessCandidate> =
  Omit<T, "front_json" | "last_review"> & {
    front_preview: string;
    is_due: boolean;
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
 * Tie-break: difficulty desc, last_review asc. Extra caller fields pass through.
 */
export function rankWeakness<T extends WeaknessCandidate>(
  rows: T[],
  nowIso: string,
  cap: number = DEFAULT_CAP,
): WeaknessRow<T>[] {
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
    .map(({ row }) => {
      const { front_json, last_review: _lastReview, ...rest } = row;
      return {
        ...rest,
        front_preview: frontPreviewFromJson(front_json),
        is_due: row.due <= nowIso,
      };
    });
}
