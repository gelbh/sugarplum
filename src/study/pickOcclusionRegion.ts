/** Stable 32-bit hash of a card id (djb2-ish) for hide_one region pick. */
export function hashCardId(cardId: string): number {
  let h = 5381;
  for (let i = 0; i < cardId.length; i++) {
    h = ((h << 5) + h + cardId.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Pick one region for hide_one study: same cardId + regions → same index.
 * Empty regions → null.
 */
export function pickOcclusionRegion<T>(
  cardId: string,
  regions: readonly T[],
): T | null {
  if (regions.length === 0) return null;
  return regions[hashCardId(cardId) % regions.length] ?? null;
}
