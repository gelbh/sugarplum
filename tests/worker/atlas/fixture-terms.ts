import {
  HOST_TERMS,
  ORGAN_TERMS,
  type HostTerm,
  type OrganTerm,
} from "../../../worker/atlas/datasets/vocab";

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
