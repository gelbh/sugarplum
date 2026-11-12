export type ZoonoticPortrait = {
  src: string;
  archetype: string;
};

const PORTRAITS: Record<string, string> = {
  yes: "/atlas/zoonotic/yes.webp",
  no: "/atlas/zoonotic/no.webp",
  potential: "/atlas/zoonotic/potential.webp",
  foodborne: "/atlas/zoonotic/foodborne.webp",
};

const LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  potential: "Possible",
  foodborne: "Foodborne",
};

/**
 * Resolve a zoonotic portrait term (`yes` | `no` | `potential` | `foodborne`).
 */
export function resolveZoonoticPortrait(term: string): ZoonoticPortrait | null {
  const src = PORTRAITS[term];
  if (src) return { src, archetype: term };
  return null;
}

export function zoonoticPortraitLabel(term: string): string {
  return LABELS[term] ?? term;
}
