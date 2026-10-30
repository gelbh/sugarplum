import { describe, it, expect } from "vitest";
import {
  rankWeakness,
  weaknessScore,
  type WeaknessCandidate,
} from "../../worker/study/weakness";
import { cardHasRegenSource } from "../../src/study/regenSource";

const NOW = "2026-10-28T12:00:00.000Z";

function candidate(
  overrides: Partial<WeaknessCandidate> & Pick<WeaknessCandidate, "id">,
): WeaknessCandidate {
  return {
    deck_id: "deck-a",
    type: "qa",
    front_json: JSON.stringify("Q?"),
    lapses: 0,
    again_14d: 0,
    hard_14d: 0,
    difficulty: 5,
    due: "2026-11-01T00:00:00.000Z",
    last_review: "2026-10-20T00:00:00.000Z",
    retrievability: null,
    ...overrides,
  };
}

describe("cardHasRegenSource", () => {
  it("is true with a job_id", () => {
    expect(cardHasRegenSource({ job_id: "job-1", provenance: null })).toBe(
      true,
    );
  });

  it("is true with a non-empty provenance excerpt", () => {
    expect(
      cardHasRegenSource({ job_id: null, provenance: { excerpt: " ex " } }),
    ).toBe(true);
  });

  it("is false with no job and a blank or missing excerpt", () => {
    expect(cardHasRegenSource({ job_id: null, provenance: null })).toBe(false);
    expect(
      cardHasRegenSource({ job_id: null, provenance: { excerpt: "  " } }),
    ).toBe(false);
    expect(cardHasRegenSource({ job_id: null, provenance: { pages: [1] } })).toBe(
      false,
    );
  });
});

describe("weaknessScore", () => {
  it("scores one Again above zero", () => {
    expect(weaknessScore(candidate({ id: "a", again_14d: 1 }))).toBe(1);
  });

  it("weights Hard at half and two Hards above zero", () => {
    expect(weaknessScore(candidate({ id: "h", hard_14d: 2 }))).toBe(1);
  });

  it("adds lapses and clamped (1-R) when R known", () => {
    expect(
      weaknessScore(
        candidate({ id: "r", lapses: 1, again_14d: 0, retrievability: 0.5 }),
      ),
    ).toBe(1 + 2 * 0.5);
  });

  it("treats null R as zero contribution", () => {
    expect(
      weaknessScore(candidate({ id: "n", lapses: 1, retrievability: null })),
    ).toBe(1);
  });
});

describe("rankWeakness", () => {
  it("includes a card with one Again", () => {
    const rows = rankWeakness(
      [candidate({ id: "again-once", again_14d: 1 })],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("again-once");
    expect(rows[0]!.hard_14d).toBe(0);
    expect(rows[0]!.again_14d).toBe(1);
  });

  it("includes two Hards (no Again / lapses)", () => {
    const rows = rankWeakness(
      [candidate({ id: "hard-twice", hard_14d: 2 })],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("hard-twice");
    expect(rows[0]!.hard_14d).toBe(2);
  });

  it("returns empty when zero bad grades and no risk", () => {
    const rows = rankWeakness(
      [
        candidate({
          id: "ok",
          again_14d: 0,
          hard_14d: 0,
          lapses: 0,
          retrievability: 1,
        }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(0);
  });

  it("ranks by weakness desc then difficulty desc then last_review asc", () => {
    const rows = rankWeakness(
      [
        candidate({
          id: "mid",
          again_14d: 2,
          difficulty: 9,
          last_review: "2026-10-10T00:00:00.000Z",
        }),
        candidate({
          id: "top",
          again_14d: 5,
          difficulty: 1,
          last_review: "2026-10-25T00:00:00.000Z",
        }),
        candidate({
          id: "low-early",
          again_14d: 2,
          difficulty: 3,
          last_review: "2026-10-01T00:00:00.000Z",
        }),
        candidate({
          id: "low-late",
          again_14d: 2,
          difficulty: 3,
          last_review: "2026-10-15T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "top",
      "mid",
      "low-early",
      "low-late",
    ]);
  });

  it("caps at 50 by default", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      candidate({
        id: `c-${i}`,
        again_14d: 60 - i,
        difficulty: i,
      }),
    );
    expect(rankWeakness(many, NOW)).toHaveLength(50);
    expect(rankWeakness(many, NOW, 3)).toHaveLength(3);
  });

  it("sets is_due when due <= now and maps front preview", () => {
    const rows = rankWeakness(
      [
        candidate({
          id: "due-now",
          again_14d: 1,
          due: "2026-10-28T12:00:00.000Z",
          front_json: JSON.stringify({ prompt: "Identify X" }),
        }),
        candidate({
          id: "future",
          again_14d: 1,
          due: "2026-10-28T12:00:00.001Z",
        }),
      ],
      NOW,
    );
    expect(rows.find((r) => r.id === "due-now")!.is_due).toBe(true);
    expect(rows.find((r) => r.id === "due-now")!.front_preview).toBe(
      "Identify X",
    );
    expect(rows.find((r) => r.id === "future")!.is_due).toBe(false);
  });

  it("keeps caller extra fields and drops front_json / last_review", () => {
    const [row] = rankWeakness(
      [{ ...candidate({ id: "x", again_14d: 1 }), extra: "kept" }],
      NOW,
    );
    expect(row).toMatchObject({ id: "x", extra: "kept" });
    expect(row).not.toHaveProperty("front_json");
    expect(row).not.toHaveProperty("last_review");
  });
});
