type Term = { broader: string[] };
const t = (...broader: string[]): Term => ({ broader });

export const HOST_TERMS: Record<string, Term> = {
  vertebrate: t(),
  "warm-blooded vertebrate": t("vertebrate"),
  mammal: t("warm-blooded vertebrate"),
  bird: t("warm-blooded vertebrate"),
  ruminant: t("mammal"),
  "small ruminant": t("ruminant"),
  cattle: t("ruminant"),
  sheep: t("small ruminant"),
  goat: t("small ruminant"),
  deer: t("ruminant"),
  equid: t("mammal"),
  horse: t("equid"),
  donkey: t("equid"),
  canid: t("mammal"),
  dog: t("canid"),
  fox: t("canid"),
  felid: t("mammal"),
  cat: t("felid"),
  pig: t("mammal"),
  human: t("mammal"),
  rodent: t("mammal"),
  frog: t("vertebrate"),
  invertebrate: t(),
  snail: t("invertebrate"),
  "aquatic snail": t("snail"),
  "land snail": t("snail"),
  slug: t("invertebrate"),
  "Galba truncatula": t("aquatic snail"),
  ant: t("invertebrate"),
  "oribatid mite": t("invertebrate"),
  flea: t("invertebrate"),
  louse: t("invertebrate"),
  "Ctenocephalides felis": t("flea"),
  "Trichodectes canis": t("louse"),
  "water buffalo": t("ruminant"),
  camelid: t("mammal"),
  fish: t("vertebrate"),
  "freshwater fish": t("fish"),
  Radix: t("aquatic snail"),
  "Radix labiata": t("Radix"),
  Bulinus: t("aquatic snail"),
  "Planorbis planorbis": t("aquatic snail"),
  Biomphalaria: t("aquatic snail"),
  Oncomelania: t("aquatic snail"),
  Bithynia: t("aquatic snail"),
};

// Fixture and slide spellings mapped to HOST_TERMS keys (lower-cased lookup).
export const HOST_ALIASES: Record<string, string> = {
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

export const ORGAN_TERMS: Record<string, Term> = {
  "gastrointestinal tract": t(),
  abomasum: t("gastrointestinal tract"),
  rumen: t("gastrointestinal tract"),
  "small intestine": t("gastrointestinal tract"),
  ileum: t("small intestine"),
  "large intestine": t("gastrointestinal tract"),
  caecum: t("large intestine"),
  liver: t(),
  "bile ducts": t("liver"),
  lungs: t(),
  "pulmonary arteries": t("lungs"),
  "central nervous system": t(),
  muscle: t(),
  skin: t(),
  blood: t(),
  "blood vessels": t("blood"),
};

export const ORGAN_ALIASES: Record<string, string> = {
  pulmonary: "lungs",
  lung: "lungs",
  cns: "central nervous system",
};

function lookup(
  raw: string,
  terms: Record<string, Term>,
  aliases: Record<string, string>,
) {
  const lower = raw.trim().toLowerCase();
  const direct = Object.keys(terms).find((k) => k.toLowerCase() === lower);
  return direct ?? aliases[lower] ?? null;
}

function covers(
  terms: Record<string, Term>,
  general: string,
  specific: string,
): boolean {
  if (general === specific) return true;
  return (terms[specific]?.broader ?? []).some((b) =>
    covers(terms, general, b),
  );
}

export const resolveHost = (raw: string) =>
  lookup(raw, HOST_TERMS, HOST_ALIASES);
export const resolveOrgan = (raw: string) =>
  lookup(raw, ORGAN_TERMS, ORGAN_ALIASES);
export const hostCovers = (g: string, s: string) => covers(HOST_TERMS, g, s);
export const organCovers = (g: string, s: string) => covers(ORGAN_TERMS, g, s);
