import {
  pagesForExcerpt,
  type PageText,
} from "./excerptPages";

/** Unique sorted positive page numbers; empty input → []. */
export function normalizeProvenancePages(
  pages: readonly number[],
): number[] {
  return [
    ...new Set(
      pages.filter(
        (page) =>
          typeof page === "number" &&
          Number.isInteger(page) &&
          page >= 1,
      ),
    ),
  ].sort((a, b) => a - b);
}

/** Merge pages into provenance JSON; keeps excerpt and other keys. */
export function mergeProvenancePagesIntoJson(
  existingJson: string | null | undefined,
  pages: readonly number[],
): string {
  const unique = normalizeProvenancePages(pages);
  let base: Record<string, unknown> = {};
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      /* start empty */
    }
  }
  return JSON.stringify({ ...base, pages: unique });
}

/**
 * After auto-rescue: pages to PATCH, or null when nothing should be written.
 * Prefer full excerpt hits from a complete scanned inventory; else `[rescued]`.
 */
export function pagesToPersistAfterRescue(args: {
  claimed: number;
  rescued: number;
  excerpt: string;
  scanned: readonly PageText[];
  scanComplete: boolean;
}): number[] | null {
  const { claimed, rescued, excerpt, scanned, scanComplete } = args;
  if (rescued === claimed) return null;
  if (!scanComplete) return normalizeProvenancePages([rescued]);
  const hits = pagesForExcerpt(excerpt, scanned);
  if (hits.length > 0) return hits;
  return normalizeProvenancePages([rescued]);
}

/**
 * After scrubber settle: pages to PATCH when display differs from last persisted first page.
 * When pageTexts has enough inventory for multi-hit excerpt matches, keep full hits;
 * otherwise `[displayPage]` (user chose a source page).
 */
export function pagesToPersistAfterNavigate(args: {
  storedFirst: number | null;
  displayPage: number;
  excerpt: string;
  pageTexts: readonly PageText[];
}): number[] | null {
  const { storedFirst, displayPage, excerpt, pageTexts } = args;
  if (storedFirst === displayPage) return null;
  const hits = pagesForExcerpt(excerpt, pageTexts);
  if (hits.length > 1 && hits.includes(displayPage)) return hits;
  return normalizeProvenancePages([displayPage]);
}

/** Clamp 1-based page into [1, pageCount]; empty count → null. */
export function clampNotesPage(
  page: number,
  pageCount: number,
): number | null {
  if (
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    !Number.isFinite(page)
  ) {
    return null;
  }
  const n = Math.trunc(page);
  if (!Number.isFinite(n)) return null;
  return Math.min(pageCount, Math.max(1, n));
}
