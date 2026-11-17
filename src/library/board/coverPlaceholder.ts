/**
 * Theme / brand solids for uncovered subject and deck posters.
 * Sourced from theme.ts, brand.css, and BoardTile shell chrome, not atlas photos.
 */
const COVER_COLORS = [
  "#5B2C6F",
  "#1e0d1b",
  "#180816",
  "#1a0b18",
  "#12070f",
  "#C4A574",
  "#8B5A9E",
  "#6A9E8B",
  "#C45C6A",
  "#CE93D8",
] as const;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable theme color when a subject/deck has no cover. Never atlas photos. */
export function coverPlaceholderColor(id: string): string {
  return COVER_COLORS[hashId(id) % COVER_COLORS.length]!;
}

export function coverPlaceholderColors(): readonly string[] {
  return COVER_COLORS;
}
