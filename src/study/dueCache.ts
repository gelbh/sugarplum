import type { CardDraftView } from "./cardDraftView";

const STORAGE_KEY = "sugarplum.dueCache.v1";

export type DueScopeOpts = { deckId?: string; subjectId?: string };

export type DueCacheSnapshot = {
  userId: string;
  savedAt: string;
  cards: CardDraftView[];
};

/** Logical due-cache scope: global Today vs scoped Study. */
export function dueCacheKey(opts?: DueScopeOpts): string {
  if (opts?.deckId) return `due:deck:${opts.deckId}`;
  if (opts?.subjectId) return `due:subject:${opts.subjectId}`;
  return "due:global";
}

/**
 * Read optional `deckId` / `subjectId` from a location search string.
 * Both set → prefer deckId (CTAs never emit both; avoids Worker 400).
 */
export function dueScopeFromSearch(search: string): DueScopeOpts | undefined {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const deckId = params.get("deckId")?.trim() || "";
  const subjectId = params.get("subjectId")?.trim() || "";
  if (deckId) return { deckId };
  if (subjectId) return { subjectId };
  return undefined;
}

function storageKey(userId: string, opts?: DueScopeOpts): string {
  return `${STORAGE_KEY}:${userId}:${dueCacheKey(opts)}`;
}

/** Pre-scope key (migrate global reads). */
function legacyStorageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

/** Persist due cards after a successful online fetch for this user + scope. */
export function saveDueCache(
  userId: string,
  cards: CardDraftView[],
  opts?: DueScopeOpts,
): void {
  const snapshot: DueCacheSnapshot = {
    userId,
    savedAt: new Date().toISOString(),
    cards,
  };
  try {
    localStorage.setItem(storageKey(userId, opts), JSON.stringify(snapshot));
    if (!opts?.deckId && !opts?.subjectId) {
      localStorage.removeItem(legacyStorageKey(userId));
    }
  } catch {
    /* quota / private mode */
  }
}

/** Read last cached due list for this user + scope, or null if missing/corrupt/mismatched. */
export function loadDueCache(
  userId: string,
  opts?: DueScopeOpts,
): DueCacheSnapshot | null {
  try {
    let raw = localStorage.getItem(storageKey(userId, opts));
    if (!raw && !opts?.deckId && !opts?.subjectId) {
      raw = localStorage.getItem(legacyStorageKey(userId));
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DueCacheSnapshot;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove one card from the cached due list (after offline grade). */
export function pruneDueCacheCard(
  userId: string,
  cardId: string,
  opts?: DueScopeOpts,
): void {
  const snap = loadDueCache(userId, opts);
  if (!snap) return;
  const next = snap.cards.filter((c) => c.id !== cardId);
  if (next.length === snap.cards.length) return;
  saveDueCache(userId, next, opts);
}

/** Drop cards that already have a pending offline grade. */
export function filterDueExcludingPending(
  cards: CardDraftView[],
  pendingIds: Set<string>,
): CardDraftView[] {
  if (pendingIds.size === 0) return cards;
  return cards.filter((c) => !pendingIds.has(c.id));
}

/** Drop cached due cards for a user (all scopes) or every user. */
export function clearDueCache(userId?: string): void {
  try {
    if (userId) {
      const prefix = `${STORAGE_KEY}:${userId}`;
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === prefix || key?.startsWith(`${prefix}:`)) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) localStorage.removeItem(key);
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
