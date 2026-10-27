/**
 * Move a due card to the front of the study queue when present.
 * Never invents cards; missing ids leave order unchanged.
 */
export function prioritizeDueCard<T extends { id: string }>(
  queue: T[],
  cardId: string | null | undefined,
): { queue: T[]; found: boolean } {
  const id = typeof cardId === "string" ? cardId.trim() : "";
  if (!id) {
    return { queue: [...queue], found: false };
  }
  const index = queue.findIndex((c) => c.id === id);
  if (index < 0) {
    return { queue: [...queue], found: false };
  }
  if (index === 0) {
    return { queue: [...queue], found: true };
  }
  const card = queue[index]!;
  const next = [...queue.slice(0, index), ...queue.slice(index + 1)];
  next.unshift(card);
  return { queue: next, found: true };
}

/** Read `?card=` from a location search string. */
export function cardIdFromSearch(search: string): string | null {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("card");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
