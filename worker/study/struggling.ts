export type StrugglingRow = {
  id: string;
  deck_id: string;
  front_preview: string;
  lapses: number;
  again_14d: number;
  difficulty: number;
  due: string;
  is_due: boolean;
};

export type StrugglingCandidate = {
  id: string;
  deck_id: string;
  front_json: string;
  lapses: number;
  again_14d: number;
  difficulty: number;
  due: string;
  last_review: string | null;
};

const DEFAULT_CAP = 50;
const PREVIEW_LEN = 120;

/** First ~120 chars of front text/prompt from stored front_json. */
export function frontPreviewFromJson(frontJson: string): string {
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

function isStruggling(row: StrugglingCandidate): boolean {
  return row.lapses >= 2 || row.again_14d >= 2;
}

/**
 * Filter accepted-schedule candidates to the struggling set, rank, and cap.
 * Rank: again_14d desc, difficulty desc, last_review asc.
 */
export function rankStruggling(
  rows: StrugglingCandidate[],
  nowIso: string,
  cap: number = DEFAULT_CAP,
): StrugglingRow[] {
  return rows
    .filter(isStruggling)
    .sort((a, b) => {
      if (b.again_14d !== a.again_14d) return b.again_14d - a.again_14d;
      if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
      const aReview = a.last_review ?? "";
      const bReview = b.last_review ?? "";
      return aReview.localeCompare(bReview);
    })
    .slice(0, cap)
    .map((row) => ({
      id: row.id,
      deck_id: row.deck_id,
      front_preview: frontPreviewFromJson(row.front_json),
      lapses: row.lapses,
      again_14d: row.again_14d,
      difficulty: row.difficulty,
      due: row.due,
      is_due: row.due <= nowIso,
    }));
}
