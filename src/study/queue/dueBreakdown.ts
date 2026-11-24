import type { CardDraftView, StudyQueueMeta } from "../../api/client";

export function dueSplitOk(
  meta: { introUsed: number; reviewUsed: number },
  cardCount: number,
): boolean {
  return (
    Number.isFinite(meta.introUsed) &&
    Number.isFinite(meta.reviewUsed) &&
    meta.introUsed >= 0 &&
    meta.reviewUsed >= 0 &&
    meta.introUsed + meta.reviewUsed === cardCount
  );
}

export type DueDeckRow = {
  deckId: string;
  title: string;
  count: number;
};

export type DueDeckRemainder = {
  deckCount: number;
  cardCount: number;
};

export type DueBreakdown = {
  /** Null when meta/card count disagree; From list can still show. */
  introUsed: number | null;
  reviewUsed: number | null;
  rows: DueDeckRow[];
  remainder: DueDeckRemainder | null;
};

export function aggregateDueByDeck(
  cards: { deck_id: string }[],
  titles: Record<string, string>,
  topN = 3,
): {
  rows: DueDeckRow[];
  remainder: DueDeckRemainder | null;
} {
  const counts = new Map<string, number>();
  for (const c of cards) {
    counts.set(c.deck_id, (counts.get(c.deck_id) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  const titleFor = (id: string) => {
    const t = titles[id]?.trim();
    return t || "Deck";
  };
  const rows = sorted.slice(0, topN).map(([deckId, count]) => ({
    deckId,
    title: titleFor(deckId),
    count,
  }));
  const tail = sorted.slice(topN);
  const remainder =
    tail.length === 0
      ? null
      : {
          deckCount: tail.length,
          cardCount: tail.reduce((n, [, c]) => n + c, 0),
        };
  return { rows, remainder };
}

/** Build Today breakdown from one due snapshot + optional deck titles. */
export function buildDueBreakdown(
  cards: CardDraftView[],
  meta: StudyQueueMeta | null | undefined,
  titles: Record<string, string>,
): DueBreakdown | null {
  if (cards.length === 0) return null;
  const { rows, remainder } = aggregateDueByDeck(cards, titles);
  if (meta && dueSplitOk(meta, cards.length)) {
    return {
      introUsed: meta.introUsed,
      reviewUsed: meta.reviewUsed,
      rows,
      remainder,
    };
  }
  return {
    introUsed: null,
    reviewUsed: null,
    rows,
    remainder,
  };
}
