export type StagePortrait = {
  src: string;
  archetype: string;
};

/** Bundled educational on-host stage portraits (public/atlas/stages/*.webp). */
const PORTRAITS: Record<string, string> = {
  adult: "/atlas/stages/adult.webp",
  nymph: "/atlas/stages/nymph.webp",
  larva: "/atlas/stages/larva.webp",
  egg: "/atlas/stages/egg.webp",
  "adult tapeworm": "/atlas/stages/adult-tapeworm.webp",
  "adult fluke": "/atlas/stages/adult-fluke.webp",
  "immature fluke": "/atlas/stages/immature-fluke.webp",
  L3: "/atlas/stages/l3.webp",
  L4: "/atlas/stages/l4.webp",
  L1: "/atlas/stages/l1.webp",
  L2: "/atlas/stages/l2.webp",
  meront: "/atlas/stages/meront.webp",
  gamont: "/atlas/stages/gamont.webp",
  trophozoite: "/atlas/stages/trophozoite.webp",
  microfilaria: "/atlas/stages/microfilaria.webp",
  cysticercus: "/atlas/stages/cysticercus.webp",
  tachyzoite: "/atlas/stages/tachyzoite.webp",
  "tissue cyst with bradyzoites": "/atlas/stages/tissue-cyst.webp",
  gametocyte: "/atlas/stages/gametocyte.webp",
  "hydatid cyst": "/atlas/stages/hydatid-cyst.webp",
  "flagellate form": "/atlas/stages/flagellate-form.webp",
  "amoeboid form": "/atlas/stages/amoeboid-form.webp",
  sporont: "/atlas/stages/sporont.webp",
  "merozoite and piroplasm": "/atlas/stages/merozoite-piroplasm.webp",
  amastigote: "/atlas/stages/amastigote.webp",
  "bloodstream trypomastigote": "/atlas/stages/trypomastigote.webp",
  schistosomulum: "/atlas/stages/schistosomulum.webp",
  "gravid proglottid": "/atlas/stages/gravid-proglottid.webp",
  coenurus: "/atlas/stages/coenurus.webp",
  metacercaria: "/atlas/stages/metacercaria.webp",
  "larvated egg": "/atlas/stages/larvated-egg.webp",
  cysticercoid: "/atlas/stages/cysticercoid.webp",
  cyst: "/atlas/stages/cyst.webp",
  oocyst: "/atlas/stages/oocyst.webp",
  "unsporulated oocyst": "/atlas/stages/unsporulated-oocyst.webp",
  spore: "/atlas/stages/spore.webp",
  sporocyst: "/atlas/stages/sporocyst.webp",
  promastigote: "/atlas/stages/promastigote.webp",
  cercaria: "/atlas/stages/cercaria.webp",
  plerocercoid: "/atlas/stages/plerocercoid.webp",
};

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
