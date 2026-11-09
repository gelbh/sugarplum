type Vocabulary<K extends string = string> = Record<
  K,
  { readonly broader: readonly K[] }
>;

export const HOST_TERMS = {
  vertebrate: { broader: [] },
  "warm-blooded vertebrate": { broader: ["vertebrate"] },
  mammal: { broader: ["warm-blooded vertebrate"] },
  bird: { broader: ["warm-blooded vertebrate"] },
  chicken: { broader: ["bird"] },
  turkey: { broader: ["bird"] },
  ruminant: { broader: ["mammal"] },
  "small ruminant": { broader: ["ruminant"] },
  cattle: { broader: ["ruminant"] },
  sheep: { broader: ["small ruminant"] },
  goat: { broader: ["small ruminant"] },
  deer: { broader: ["ruminant"] },
  equid: { broader: ["mammal"] },
  horse: { broader: ["equid"] },
  donkey: { broader: ["equid"] },
  canid: { broader: ["mammal"] },
  dog: { broader: ["canid"] },
  fox: { broader: ["canid"] },
  felid: { broader: ["mammal"] },
  cat: { broader: ["felid"] },
  pig: { broader: ["mammal"] },
  human: { broader: ["mammal"] },
  rodent: { broader: ["mammal"] },
  rabbit: { broader: ["mammal"] },
  "non-human primate": { broader: ["mammal"] },
  frog: { broader: ["vertebrate"] },
  invertebrate: { broader: [] },
  snail: { broader: ["invertebrate"] },
  "aquatic snail": { broader: ["snail"] },
  "land snail": { broader: ["snail"] },
  slug: { broader: ["invertebrate"] },
  earthworm: { broader: ["invertebrate"] },
  "lymnaeid snail": { broader: ["aquatic snail"] },
  "Galba truncatula": { broader: ["lymnaeid snail"] },
  ant: { broader: ["invertebrate"] },
  beetle: { broader: ["invertebrate"] },
  copepod: { broader: ["invertebrate"] },
  "oribatid mite": { broader: ["invertebrate"] },
  flea: { broader: ["invertebrate"] },
  louse: { broader: ["invertebrate"] },
  tick: { broader: ["invertebrate"] },
  mosquito: { broader: ["invertebrate"] },
  "sand fly": { broader: ["invertebrate"] },
  "tsetse fly": { broader: ["invertebrate"] },
  "Ctenocephalides felis": { broader: ["flea"] },
  "Trichodectes canis": { broader: ["louse"] },
  "Rhipicephalus sanguineus": { broader: ["tick"] },
  "water buffalo": { broader: ["ruminant"] },
  "African buffalo": { broader: ["ruminant"] },
  camelid: { broader: ["mammal"] },
  fish: { broader: ["vertebrate"] },
  "freshwater fish": { broader: ["fish"] },
  Radix: { broader: ["lymnaeid snail"] },
  "Radix labiata": { broader: ["Radix"] },
  Bulinus: { broader: ["aquatic snail"] },
  "Planorbis planorbis": { broader: ["aquatic snail"] },
  Biomphalaria: { broader: ["aquatic snail"] },
  Oncomelania: { broader: ["aquatic snail"] },
  Bithynia: { broader: ["aquatic snail"] },
  "Indoplanorbis exustus": { broader: ["aquatic snail"] },
  "Glyptanisus gilberti": { broader: ["aquatic snail"] },
  "Neotricula aperta": { broader: ["aquatic snail"] },
  Formica: { broader: ["ant"] },
  fly: { broader: ["invertebrate"] },
  Simulium: { broader: ["fly"] },
  Culicoides: { broader: ["fly"] },
  "Musca domestica": { broader: ["fly"] },
  "Musca autumnalis": { broader: ["fly"] },
  "Stomoxys calcitrans": { broader: ["fly"] },
  Haematobia: { broader: ["fly"] },
} as const satisfies Vocabulary;

export const ORGAN_TERMS = {
  "gastrointestinal tract": { broader: [] },
  stomach: { broader: ["gastrointestinal tract"] },
  abomasum: { broader: ["stomach"] },
  rumen: { broader: ["stomach"] },
  "small intestine": { broader: ["gastrointestinal tract"] },
  ileum: { broader: ["small intestine"] },
  "large intestine": { broader: ["gastrointestinal tract"] },
  caecum: { broader: ["large intestine"] },
  liver: { broader: [] },
  "bile ducts": { broader: ["liver"] },
  lungs: { broader: [] },
  "pulmonary arteries": { broader: ["lungs"] },
  "central nervous system": { broader: [] },
  muscle: { broader: [] },
  skin: { broader: [] },
  blood: { broader: [] },
  "blood vessels": { broader: ["blood"] },
  "red blood cells": { broader: ["blood"] },
  "reproductive tract": { broader: [] },
  "haemolymphatic organs": { broader: [] },
  "lymph nodes": { broader: ["haemolymphatic organs"] },
  "bone marrow": { broader: ["haemolymphatic organs"] },
  eye: { broader: [] },
  "connective tissue": { broader: [] },
  "nuchal ligament": { broader: ["connective tissue"] },
} as const satisfies Vocabulary;

export type HostTerm = keyof typeof HOST_TERMS;
export type OrganTerm = keyof typeof ORGAN_TERMS;

// Every broader entry must name a term in the same vocabulary.
HOST_TERMS satisfies Vocabulary<HostTerm>;
ORGAN_TERMS satisfies Vocabulary<OrganTerm>;

export const HOST_TERM_KEYS = Object.keys(HOST_TERMS) as HostTerm[];
export const ORGAN_TERM_KEYS = Object.keys(ORGAN_TERMS) as OrganTerm[];

function covers(
  terms: Vocabulary,
  general: string,
  specific: string,
  visited: Set<string> = new Set(),
): boolean {
  if (general === specific) return true;
  if (visited.has(specific)) return false;
  visited.add(specific);
  const term = Object.hasOwn(terms, specific) ? terms[specific] : undefined;
  return (term?.broader ?? []).some((b) => covers(terms, general, b, visited));
}

export const hostCovers = (g: string, s: string) => covers(HOST_TERMS, g, s);
export const organCovers = (g: string, s: string) => covers(ORGAN_TERMS, g, s);
