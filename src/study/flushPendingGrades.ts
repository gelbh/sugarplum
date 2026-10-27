import type { PendingGrade } from "./pendingGrades";

export type FlushDeps = {
  pending: PendingGrade[];
  dueIds: Set<string>;
  review: (cardId: string, rating: 1 | 2 | 3 | 4) => Promise<unknown>;
  isSkipStatus?: (err: unknown) => boolean;
};

function defaultIsSkipStatus(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return status === 404 || status === 400;
}

/** Flush pending grades in order; caller persists `remaining`. */
export async function flushPendingGrades(
  deps: FlushDeps,
): Promise<{ applied: number; skipped: number; remaining: PendingGrade[] }> {
  const isSkipStatus = deps.isSkipStatus ?? defaultIsSkipStatus;
  let applied = 0;
  let skipped = 0;

  for (let i = 0; i < deps.pending.length; i++) {
    const item = deps.pending[i]!;
    if (!deps.dueIds.has(item.cardId)) {
      skipped++;
      continue;
    }
    try {
      await deps.review(item.cardId, item.rating);
      applied++;
    } catch (err) {
      if (isSkipStatus(err)) {
        skipped++;
        continue;
      }
      return {
        applied,
        skipped,
        remaining: deps.pending.slice(i),
      };
    }
  }

  return { applied, skipped, remaining: [] };
}
