import { mediaUrl } from "../api/client";

/** Prefetch due-card media into the SW cache (best-effort; swallow errors). */
export function warmDueMedia(
  cards: { media_r2_keys?: string[] | null }[],
): void {
  const keys = new Set<string>();
  for (const card of cards) {
    for (const key of card.media_r2_keys ?? []) {
      if (key) keys.add(key);
    }
  }
  for (const key of keys) {
    void fetch(mediaUrl(key), { credentials: "same-origin" }).catch(() => {
      /* quota / network / offline */
    });
  }
}
