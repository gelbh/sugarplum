import type { Rarity } from "./traits";

export type FruitType =
  | "apple"
  | "lemon"
  | "strawberry"
  | "coconut"
  | "pear"
  | "orange"
  | "grape"
  | "cherry"
  | "kiwi"
  | "pineapple"
  | "plum";

export const FRUIT_ORDER: FruitType[] = [
  "apple",
  "lemon",
  "strawberry",
  "coconut",
  "pear",
  "orange",
  "grape",
  "cherry",
  "kiwi",
  "pineapple",
  "plum",
];

export const FRUIT_LABEL: Record<FruitType, string> = {
  apple: "Apple",
  lemon: "Lemon",
  strawberry: "Strawberry",
  coconut: "Coconut",
  pear: "Pear",
  orange: "Orange",
  grape: "Grape",
  cherry: "Cherry",
  kiwi: "Kiwi",
  pineapple: "Pineapple",
  plum: "Plum",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
