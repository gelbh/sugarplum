import type { CardDraftView } from "../api/client";

const STORAGE_KEY = "sugarplum.dueCache.v1";

export type DueCacheSnapshot = {
  userId: string;
  savedAt: string;
  cards: CardDraftView[];
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

/** Persist due cards after a successful online fetch for this user. */
export function saveDueCache(userId: string, cards: CardDraftView[]): void {
  const snapshot: DueCacheSnapshot = {
    userId,
    savedAt: new Date().toISOString(),
    cards,
  };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

/** Read last cached due list for this user, or null if missing/corrupt/mismatched. */
export function loadDueCache(userId: string): DueCacheSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DueCacheSnapshot;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop cached due cards for a user (e.g. on logout). */
export function clearDueCache(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    const prefix = `${STORAGE_KEY}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) || key === STORAGE_KEY) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
