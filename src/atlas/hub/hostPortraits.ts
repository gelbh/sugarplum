import { HOST_TERMS, type HostTerm } from "../../../worker/atlas/datasets/vocab";

export type HostPortrait = {
  src: string;
  archetype: string;
};

/** Bundled educational host portraits (public/atlas/hosts/*.webp). */
const PORTRAITS: Record<string, string> = {
  vertebrate: "/atlas/hosts/vertebrate.webp",
  "warm-blooded vertebrate": "/atlas/hosts/warm-blooded-vertebrate.webp",
  mammal: "/atlas/hosts/mammal.webp",
  invertebrate: "/atlas/hosts/invertebrate.webp",
  sheep: "/atlas/hosts/sheep.webp",
  cattle: "/atlas/hosts/cattle.webp",
  goat: "/atlas/hosts/goat.webp",
  human: "/atlas/hosts/human.webp",
  "non-human primate": "/atlas/hosts/non-human-primate.webp",
  dog: "/atlas/hosts/dog.webp",
  cat: "/atlas/hosts/cat.webp",
  pig: "/atlas/hosts/pig.webp",
  horse: "/atlas/hosts/horse.webp",
  deer: "/atlas/hosts/deer.webp",
  snail: "/atlas/hosts/snail.webp",
  "aquatic snail": "/atlas/hosts/aquatic-snail.webp",
  "land snail": "/atlas/hosts/land-snail.webp",
  "lymnaeid snail": "/atlas/hosts/lymnaeid-snail.webp",
  slug: "/atlas/hosts/slug.webp",
  tick: "/atlas/hosts/tick.webp",
  flea: "/atlas/hosts/flea.webp",
  louse: "/atlas/hosts/louse.webp",
  "oribatid mite": "/atlas/hosts/oribatid-mite.webp",
  mosquito: "/atlas/hosts/mosquito.webp",
  "sand fly": "/atlas/hosts/sand-fly.webp",
  "tsetse fly": "/atlas/hosts/tsetse-fly.webp",
  chicken: "/atlas/hosts/chicken.webp",
  bird: "/atlas/hosts/bird.webp",
  turkey: "/atlas/hosts/turkey.webp",
  gamebird: "/atlas/hosts/gamebird.webp",
  pheasant: "/atlas/hosts/pheasant.webp",
  fish: "/atlas/hosts/fish.webp",
  "freshwater fish": "/atlas/hosts/freshwater-fish.webp",
  "marine fish": "/atlas/hosts/marine-fish.webp",
  rabbit: "/atlas/hosts/rabbit.webp",
  rodent: "/atlas/hosts/rodent.webp",
  hedgehog: "/atlas/hosts/hedgehog.webp",
  fox: "/atlas/hosts/fox.webp",
  canid: "/atlas/hosts/canid.webp",
  felid: "/atlas/hosts/felid.webp",
  camelid: "/atlas/hosts/camelid.webp",
  fly: "/atlas/hosts/fly.webp",
  donkey: "/atlas/hosts/donkey.webp",
  equid: "/atlas/hosts/equid.webp",
  ruminant: "/atlas/hosts/ruminant.webp",
  "small ruminant": "/atlas/hosts/small-ruminant.webp",
  "water buffalo": "/atlas/hosts/water-buffalo.webp",
  "African buffalo": "/atlas/hosts/african-buffalo.webp",
  earthworm: "/atlas/hosts/earthworm.webp",
  ant: "/atlas/hosts/ant.webp",
  beetle: "/atlas/hosts/beetle.webp",
  copepod: "/atlas/hosts/copepod.webp",
  squid: "/atlas/hosts/squid.webp",
  frog: "/atlas/hosts/frog.webp",
  reptile: "/atlas/hosts/reptile.webp",
  crustacean: "/atlas/hosts/crustacean.webp",
  pinniped: "/atlas/hosts/pinniped.webp",
  cetacean: "/atlas/hosts/cetacean.webp",
  "marine mammal": "/atlas/hosts/marine-mammal.webp",
};

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
