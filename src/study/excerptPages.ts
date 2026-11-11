export type PageText = { page: number; text: string };

export type ProvenancePages = { pages: number[]; excerpt: string };

/** Trim + collapse whitespace; shared by wash and page stamp. */
export function normalizeExcerptText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * 1-based page numbers whose text contains the excerpt (normalized inclusion).
 * Empty excerpt → [].
 */
export function pagesForExcerpt(
  excerpt: string,
  pages: readonly PageText[],
): number[] {
  const needle = normalizeExcerptText(excerpt);
  if (!needle) return [];
  const hits = new Set<number>();
  for (const item of pages) {
    if (
      typeof item.page === "number" &&
      Number.isFinite(item.page) &&
      item.page >= 1 &&
      normalizeExcerptText(item.text).includes(needle)
    ) {
      hits.add(item.page);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

/** Prefer claimed page when it hits; else first excerpt hit; else claimed. */
export function resolveNotesDisplayPage(args: {
  claimed: number | null;
  excerpt: string;
  pages: readonly PageText[];
}): number | null {
  const { claimed, excerpt, pages } = args;
  if (claimed === null) return null;
  const hits = pagesForExcerpt(excerpt, pages);
  if (hits.length === 0) return claimed;
  if (hits.includes(claimed)) return claimed;
  return hits[0] ?? claimed;
}

/**
 * Remap draft provenance.pages from study-window page texts.
 * Hit → matching pages; miss → pickedPages when non-empty; else leave pages.
 */
export function stampDraftProvenancePages<
  T extends { provenance: ProvenancePages },
>(
  drafts: readonly T[],
  pageTexts: readonly PageText[],
  pickedPages: readonly number[],
): T[] {
  const fallback = pickedPages.filter(
    (page) => typeof page === "number" && Number.isFinite(page) && page >= 1,
  );
  const uniqueFallback = [...new Set(fallback)].sort((a, b) => a - b);

  return drafts.map((draft) => {
    const hits = pagesForExcerpt(draft.provenance.excerpt, pageTexts);
    const pages =
      hits.length > 0
        ? hits
        : uniqueFallback.length > 0
          ? uniqueFallback
          : draft.provenance.pages;
    if (
      pages.length === draft.provenance.pages.length &&
      pages.every((page, index) => page === draft.provenance.pages[index])
    ) {
      return draft;
    }
    return {
      ...draft,
      provenance: { ...draft.provenance, pages },
    };
  });
}
