import { State } from "ts-fsrs";

export const SHORT_TERM_MAX_MS = 86_400_000;

export type PendingLearning<T extends { id: string }> = {
  cardId: string;
  dueAt: string;
  card: T;
};

export function isShortTermFollowUp(input: {
  dueIso: string;
  gradedAt: Date;
  state?: number | null;
}): boolean {
  const { state } = input;
  if (state === State.Learning || state === State.Relearning) return true;
  if (state === State.Review || state === State.New) return false;
  const dueMs = Date.parse(input.dueIso);
  if (!Number.isFinite(dueMs)) return false;
  const delta = dueMs - input.gradedAt.getTime();
  return delta >= 0 && delta < SHORT_TERM_MAX_MS;
}

export function upsertPendingLearning<T extends { id: string }>(
  list: PendingLearning<T>[],
  entry: PendingLearning<T>,
): PendingLearning<T>[] {
  return [...list.filter((p) => p.cardId !== entry.cardId), entry];
}

export function mergeDueLearning<T extends { id: string }>(
  queue: T[],
  pending: PendingLearning<T>[],
  now: Date,
): { queue: T[]; pending: PendingLearning<T>[] } {
  const nowMs = now.getTime();
  const due = pending
    .filter((p) => Date.parse(p.dueAt) <= nowMs)
    .sort((a, b) => {
      if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
      if (a.cardId !== b.cardId) return a.cardId < b.cardId ? -1 : 1;
      return 0;
    });
  const still = pending.filter((p) => Date.parse(p.dueAt) > nowMs);
  const inQueue = new Set(queue.map((c) => c.id));
  const nextQueue = [...queue];
  for (const p of due) {
    if (inQueue.has(p.cardId)) continue;
    nextQueue.push(p.card);
    inQueue.add(p.cardId);
  }
  return { queue: nextQueue, pending: still };
}

export function nextLearningWakeAt<T extends { id: string }>(
  pending: PendingLearning<T>[],
  now: Date,
): Date | null {
  let best: number | null = null;
  const nowMs = now.getTime();
  for (const p of pending) {
    const t = Date.parse(p.dueAt);
    if (!Number.isFinite(t) || t <= nowMs) continue;
    if (best == null || t < best) best = t;
  }
  return best == null ? null : new Date(best);
}
