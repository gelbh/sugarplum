const SITE_PLATES = [
  "muscle",
  "liver",
  "lungs",
  "eye",
  "blood",
  "skin",
  "stomach",
  "trachea",
  "lymph-nodes",
  "central-nervous-system",
  "bone-marrow",
  "urinary-bladder",
] as const;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Photographic atlas plate when a subject/deck has no cover. Never medal fruit. */
export function coverPlaceholderSrc(id: string): string {
  const name = SITE_PLATES[hashId(id) % SITE_PLATES.length]!;
  return `/atlas/sites/${name}.webp`;
}

export function coverPlaceholderNames(): readonly string[] {
  return SITE_PLATES;
}
