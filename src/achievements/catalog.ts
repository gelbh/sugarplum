import type { Rarity } from "./traits";

export type FruitType =
  "apple" | "lemon" | "strawberry" | "pear" | "cherry" | "kiwi" | "plum";

export const FRUIT_ORDER: FruitType[] = [
  "apple",
  "lemon",
  "strawberry",
  "pear",
  "cherry",
  "kiwi",
  "plum",
];

export const FRUIT_LABEL: Record<FruitType, string> = {
  apple: "Apple",
  lemon: "Lemon",
  strawberry: "Strawberry",
  pear: "Pear",
  cherry: "Cherry",
  kiwi: "Kiwi",
  plum: "Plum",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
