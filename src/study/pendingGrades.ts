const STORAGE_KEY = "sugarplum.pendingGrades.v1";

export type PendingGrade = {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  queuedAt: string;
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

function readList(userId: string): PendingGrade[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingGrade[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Persist list; returns false on quota / private mode failure. */
function writeList(userId: string, items: PendingGrade[]): boolean {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/**
 * Queue (or replace) a pending grade for offline flush later.
 * Coalesces by cardId: last rating wins. Returns false if storage write failed.
 */
export function enqueuePendingGrade(
  userId: string,
  cardId: string,
  rating: 1 | 2 | 3 | 4,
): boolean {
  const items = readList(userId).filter((p) => p.cardId !== cardId);
  items.push({
    cardId,
    rating,
    queuedAt: new Date().toISOString(),
  });
  return writeList(userId, items);
}

/** Read pending grades for a user (empty if missing/corrupt). */
export function listPendingGrades(userId: string): PendingGrade[] {
  return readList(userId);
}

/** Card ids currently waiting to sync. */
export function pendingCardIdSet(userId: string): Set<string> {
  return new Set(readList(userId).map((p) => p.cardId));
}

/** Replace the entire pending queue for a user (e.g. after flush). */
export function replacePendingGrades(
  userId: string,
  items: PendingGrade[],
): boolean {
  return writeList(userId, items);
}

export function dropPendingGrade(userId: string, cardId: string): void {
  const next = readList(userId).filter((item) => item.cardId !== cardId);
  writeList(userId, next);
}

/** Drop pending grades for one user, or all keys with the pending prefix. */
export function clearPendingGrades(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    const prefix = `${STORAGE_KEY}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
