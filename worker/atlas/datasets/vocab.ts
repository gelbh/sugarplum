type Vocabulary<K extends string = string> = Record<
  K,
  { readonly broader: readonly K[] }
>;

export const HOST_TERMS = {
  vertebrate: { broader: [] },
  "warm-blooded vertebrate": { broader: ["vertebrate"] },
  mammal: { broader: ["warm-blooded vertebrate"] },
  bird: { broader: ["warm-blooded vertebrate"] },
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
  frog: { broader: ["vertebrate"] },
  invertebrate: { broader: [] },
  snail: { broader: ["invertebrate"] },
  "aquatic snail": { broader: ["snail"] },
  "land snail": { broader: ["snail"] },
  slug: { broader: ["invertebrate"] },
  "lymnaeid snail": { broader: ["aquatic snail"] },
  "Galba truncatula": { broader: ["lymnaeid snail"] },
  ant: { broader: ["invertebrate"] },
  "oribatid mite": { broader: ["invertebrate"] },
  flea: { broader: ["invertebrate"] },
  louse: { broader: ["invertebrate"] },
  "Ctenocephalides felis": { broader: ["flea"] },
  "Trichodectes canis": { broader: ["louse"] },
  "water buffalo": { broader: ["ruminant"] },
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
} as const satisfies Vocabulary;

export const ORGAN_TERMS = {
  "gastrointestinal tract": { broader: [] },
  abomasum: { broader: ["gastrointestinal tract"] },
  rumen: { broader: ["gastrointestinal tract"] },
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

// Fixture and slide spellings mapped to vocabulary terms (lower-cased lookup).
export const HOST_ALIASES: Record<string, HostTerm> = {
  dogs: "dog",
  canids: "canid",
  foxes: "fox",
  felids: "felid",
  felidae: "felid",
  cats: "cat",
  ruminants: "ruminant",
  "small ruminants": "small ruminant",
  goats: "goat",
  equids: "equid",
  horses: "horse",
  humans: "human",
  rodents: "rodent",
  vertebrates: "vertebrate",
  birds: "bird",
  frogs: "frog",
  snails: "snail",
  slugs: "slug",
  "water snail": "aquatic snail",
  "forage mites": "oribatid mite",
  fleas: "flea",
  lice: "louse",
};

export const ORGAN_ALIASES: Record<string, OrganTerm> = {
  pulmonary: "lungs",
  lung: "lungs",
  cns: "central nervous system",
};

function lookup<T extends string>(
  raw: string,
  terms: Record<T, unknown>,
  aliases: Record<string, T>,
): T | null {
  const lower = raw.trim().toLowerCase();
  const direct = (Object.keys(terms) as T[]).find(
    (k) => k.toLowerCase() === lower,
  );
  if (direct) return direct;
  return Object.hasOwn(aliases, lower) ? aliases[lower] : null;
}

export const resolveHost = (raw: string) =>
  lookup(raw, HOST_TERMS, HOST_ALIASES);
export const resolveOrgan = (raw: string) =>
  lookup(raw, ORGAN_TERMS, ORGAN_ALIASES);
