export type StagePortrait = {
  src: string;
  archetype: string;
};

/**
 * Bundled CDC DPDx stage archetypes (public/atlas/stages/*.webp).
 * Empty until CREDITS hunt ships files; AI placeholders removed.
 */
const PORTRAITS: Record<string, string> = {};

/** Free-text stage labels that share a close bundled archetype. */
const ALIASES: Record<string, string> = {
  "migrating L3": "L3",
  "somatic L3": "L3",
  "encysted L3": "L3",
  "L3 in marine fish": "L3",
  "migrating L1": "L1",
  "migrating larva": "larva",
  "newborn larva": "larva",
  "pre-adult larva": "larva",
  "nurse cell larva": "larva",
  "infective larva in egg": "larva",
  "adult female": "adult",
  "parasitic adult female": "adult",
  "adult or nymph": "adult",
  schizont: "meront",
  "exoerythrocytic meront": "meront",
  "erythrocytic meront": "meront",
  "sarcocyst with bradyzoites": "tissue cyst with bradyzoites",
  "trophozoite and merozoite": "trophozoite",
  "metacyclic trypomastigote": "bloodstream trypomastigote",
  "stage in Heterakis egg": "egg",
};

/**
 * Resolve an on-host stage label to a bundled portrait via exact key
 * then aliases.
 */
export function resolveStagePortrait(term: string): StagePortrait | null {
  const key = ALIASES[term] ?? term;
  const src = PORTRAITS[key];
  if (src) return { src, archetype: key };
  return null;
}
