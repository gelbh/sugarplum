import { HOST_TERMS, type HostTerm } from "../../worker/atlas/datasets/vocab";

export type HostPortrait = {
  src: string;
  archetype: string;
};

/**
 * Bundled open-licence host photos (public/atlas/hosts/*.webp).
 * Empty until CREDITS hunt ships files; AI placeholders removed.
 */
const PORTRAITS: Record<string, string> = {};

/**
 * Species / synonym keys with no dedicated file map to a close bundled
 * archetype. Broader parents in HOST_TERMS cover the rest.
 */
const ALIASES: Record<string, string> = {
  "Galba truncatula": "lymnaeid snail",
  Radix: "lymnaeid snail",
  "Radix labiata": "lymnaeid snail",
  Bulinus: "aquatic snail",
  "Planorbis planorbis": "aquatic snail",
  Biomphalaria: "aquatic snail",
  Oncomelania: "aquatic snail",
  Bithynia: "aquatic snail",
  "Indoplanorbis exustus": "aquatic snail",
  "Glyptanisus gilberti": "aquatic snail",
  "Neotricula aperta": "aquatic snail",
  Formica: "ant",
  Simulium: "fly",
  Culicoides: "fly",
  "Musca domestica": "fly",
  "Musca autumnalis": "fly",
  "Stomoxys calcitrans": "fly",
  Haematobia: "fly",
  "Ctenocephalides felis": "flea",
  "Trichodectes canis": "louse",
  "Rhipicephalus sanguineus": "tick",
};

/**
 * Resolve a host vocabulary term to a bundled portrait by walking
 * aliases then HOST_TERMS broader parents.
 */
export function resolveHostPortrait(term: string): HostPortrait | null {
  const queue: string[] = [term];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const key = ALIASES[cur] ?? cur;
    const src = PORTRAITS[key];
    if (src) return { src, archetype: key };
    const broader =
      cur in HOST_TERMS
        ? HOST_TERMS[cur as HostTerm].broader
        : ([] as readonly string[]);
    for (const b of broader) queue.push(b);
  }
  return null;
}
