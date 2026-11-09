const PREFIX = "sugarplum.atlas.lastDeck.";

export function lastDeckStorageKey(atlasId: string): string {
  return `${PREFIX}${atlasId}`;
}

export function readLastDeckId(atlasId: string): string | null {
  try {
    const raw = localStorage.getItem(lastDeckStorageKey(atlasId));
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeLastDeckId(atlasId: string, deckId: string): void {
  try {
    localStorage.setItem(lastDeckStorageKey(atlasId), deckId);
  } catch {
    /* ignore quota / private mode */
  }
}
