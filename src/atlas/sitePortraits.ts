import { ORGAN_TERMS, type OrganTerm } from "../../worker/atlas/datasets/vocab";

export type SitePortrait = {
  src: string;
  archetype: string;
};

/** Bundled educational site portraits (public/atlas/sites/*.webp). */
const PORTRAITS: Record<string, string> = {
  "gastrointestinal tract": "/atlas/sites/gastrointestinal-tract.webp",
  stomach: "/atlas/sites/stomach.webp",
  abomasum: "/atlas/sites/abomasum.webp",
  rumen: "/atlas/sites/rumen.webp",
  "small intestine": "/atlas/sites/small-intestine.webp",
  ileum: "/atlas/sites/ileum.webp",
  "large intestine": "/atlas/sites/large-intestine.webp",
  caecum: "/atlas/sites/caecum.webp",
  liver: "/atlas/sites/liver.webp",
  "bile ducts": "/atlas/sites/bile-ducts.webp",
  lungs: "/atlas/sites/lungs.webp",
  "pulmonary arteries": "/atlas/sites/pulmonary-arteries.webp",
  "central nervous system": "/atlas/sites/central-nervous-system.webp",
  muscle: "/atlas/sites/muscle.webp",
  skin: "/atlas/sites/skin.webp",
  blood: "/atlas/sites/blood.webp",
  "blood vessels": "/atlas/sites/blood-vessels.webp",
  "red blood cells": "/atlas/sites/red-blood-cells.webp",
  "reproductive tract": "/atlas/sites/reproductive-tract.webp",
  "haemolymphatic organs": "/atlas/sites/haemolymphatic-organs.webp",
  "lymph nodes": "/atlas/sites/lymph-nodes.webp",
  "bone marrow": "/atlas/sites/bone-marrow.webp",
  eye: "/atlas/sites/eye.webp",
  "ear canal": "/atlas/sites/ear-canal.webp",
  "nasal cavity": "/atlas/sites/nasal-cavity.webp",
  "connective tissue": "/atlas/sites/connective-tissue.webp",
  "nuchal ligament": "/atlas/sites/nuchal-ligament.webp",
  oesophagus: "/atlas/sites/oesophagus.webp",
  trachea: "/atlas/sites/trachea.webp",
  "urinary bladder": "/atlas/sites/urinary-bladder.webp",
};

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
