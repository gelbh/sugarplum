import { ORGAN_TERMS, type OrganTerm } from "../../worker/atlas/datasets/vocab";

export type SitePortrait = {
  src: string;
  archetype: string;
};

/**
 * Bundled Anatomography / Commons site portraits (public/atlas/sites/*.webp).
 * Empty until CREDITS hunt ships files; AI placeholders removed.
 */
const PORTRAITS: Record<string, string> = {};

/**
 * Resolve an organ vocabulary term to a bundled portrait by walking
 * ORGAN_TERMS broader parents.
 */
export function resolveSitePortrait(term: string): SitePortrait | null {
  const queue: string[] = [term];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const src = PORTRAITS[cur];
    if (src) return { src, archetype: cur };
    const broader =
      cur in ORGAN_TERMS
        ? ORGAN_TERMS[cur as OrganTerm].broader
        : ([] as readonly string[]);
    for (const b of broader) queue.push(b);
  }
  return null;
}
