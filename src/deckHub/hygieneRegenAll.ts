import type { RegenCardType } from "../api/types";

export type HygieneRegenCard = {
  id: string;
  type: string;
  front_preview: string;
};

export type HygieneRegenProgress = {
  done: number;
  total: number;
};

export type HygieneRegenResult = {
  succeeded: number;
  skipped: number;
  failedAt: { id: string; front_preview: string } | null;
  error: unknown | null;
};

/**
 * Sequential client-side hygiene tidy: stop on first regen failure.
 * `total` / progress count only eligible cards (resolveType non-null).
 */
export async function runHygieneRegenAll(args: {
  cards: HygieneRegenCard[];
  resolveType: (type: string) => RegenCardType | null;
  regen: (cardId: string, type: RegenCardType) => Promise<unknown>;
  onProgress?: (progress: HygieneRegenProgress) => void;
}): Promise<HygieneRegenResult> {
  const eligible = args.cards
    .map((card) => {
      const type = args.resolveType(card.type);
      return type == null ? null : { card, type };
    })
    .filter((row): row is { card: HygieneRegenCard; type: RegenCardType } => row != null);

  const skipped = args.cards.length - eligible.length;
  const total = eligible.length;
  let succeeded = 0;

  for (const { card, type } of eligible) {
    try {
      await args.regen(card.id, type);
      succeeded += 1;
      args.onProgress?.({ done: succeeded, total });
    } catch (error) {
      return {
        succeeded,
        skipped,
        failedAt: { id: card.id, front_preview: card.front_preview },
        error,
      };
    }
  }

  return {
    succeeded,
    skipped,
    failedAt: null,
    error: null,
  };
}
