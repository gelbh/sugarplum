import type { CardDraftView } from "../api/client";

const STORAGE_KEY = "sugarplum.dueCache.v1";

export type DueCacheSnapshot = {
  savedAt: string;
  cards: CardDraftView[];
};

/** Persist due cards after a successful online fetch. */
export function saveDueCache(cards: CardDraftView[]): void {
  const snapshot: DueCacheSnapshot = {
    savedAt: new Date().toISOString(),
    cards,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

/** Read last cached due list, or null if missing/corrupt. */
export function loadDueCache(): DueCacheSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DueCacheSnapshot;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    return parsed;
  } catch {
    return null;
  }
}
