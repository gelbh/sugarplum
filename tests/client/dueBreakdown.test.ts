import { describe, expect, it } from "vitest";
import type { CardDraftView, StudyQueueMeta } from "../../src/api/client";
import {
  aggregateDueByDeck,
  buildDueBreakdown,
  dueSplitOk,
} from "../../src/study/dueBreakdown";

const meta = (partial: Partial<StudyQueueMeta> = {}): StudyQueueMeta => ({
  introUsed: 0,
  introBudget: 20,
  reviewUsed: 0,
  reviewBudget: 200,
  heldIntroCount: 0,
  deferredCount: 0,
  ...partial,
});

function card(deck_id: string, id = deck_id): CardDraftView {
  return {
    id,
    deck_id,
    job_id: null,
    type: "basic",
    front: "q",
    back: "a",
    provenance: null,
    status: "accepted",
    created_at: "",
    updated_at: "",
  };
}

describe("dueSplitOk", () => {
  it("true when intro+review equals card count", () => {
    expect(dueSplitOk({ introUsed: 12, reviewUsed: 73 }, 85)).toBe(true);
  });
  it("false when counts disagree", () => {
    expect(dueSplitOk({ introUsed: 12, reviewUsed: 70 }, 85)).toBe(false);
  });
  it("false for negative counts", () => {
    expect(dueSplitOk({ introUsed: -1, reviewUsed: 86 }, 85)).toBe(false);
  });
});

describe("aggregateDueByDeck", () => {
  it("top 3 + remainder", () => {
    const cards = [
      ...Array(31).fill({ deck_id: "a" }),
      ...Array(28).fill({ deck_id: "b" }),
      ...Array(16).fill({ deck_id: "c" }),
      ...Array(6).fill({ deck_id: "d" }),
      ...Array(4).fill({ deck_id: "e" }),
    ];
    const out = aggregateDueByDeck(cards, {
      a: "Parasites",
      b: "Cell biology",
      c: "Neuro",
      d: "X",
      e: "Y",
    });
    expect(out.rows).toEqual([
      { deckId: "a", title: "Parasites", count: 31 },
      { deckId: "b", title: "Cell biology", count: 28 },
      { deckId: "c", title: "Neuro", count: 16 },
    ]);
    expect(out.remainder).toEqual({ deckCount: 2, cardCount: 10 });
  });

  it("missing title falls back without throwing", () => {
    const out = aggregateDueByDeck([{ deck_id: "z" }], {});
    expect(out.rows[0]?.title.length).toBeGreaterThan(0);
    expect(out.remainder).toBeNull();
  });
});

describe("buildDueBreakdown", () => {
  it("keeps From when meta disagrees; nulls split", () => {
    const cards = [card("a", "1"), card("a", "2")];
    const out = buildDueBreakdown(
      cards,
      meta({ introUsed: 9, reviewUsed: 0 }),
      { a: "Parasites" },
    );
    expect(out?.introUsed).toBeNull();
    expect(out?.reviewUsed).toBeNull();
    expect(out?.rows).toEqual([
      { deckId: "a", title: "Parasites", count: 2 },
    ]);
  });

  it("fills split when meta matches", () => {
    const cards = [card("a", "1"), card("b", "2")];
    const out = buildDueBreakdown(
      cards,
      meta({ introUsed: 1, reviewUsed: 1 }),
      { a: "A", b: "B" },
    );
    expect(out?.introUsed).toBe(1);
    expect(out?.reviewUsed).toBe(1);
    expect(out?.rows).toHaveLength(2);
  });
});
