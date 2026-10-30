import type { Rarity } from "./traits";

export type FruitType =
  "apple" | "lemon" | "strawberry" | "pear" | "cherry" | "kiwi" | "plum";

export type AchievementMeta = {
  fruitType: FruitType;
  title: string;
  rarity: Rarity;
};

/** Unlock responses carry ids only; must match the achievement_defs seed (catalog.test). */
export const ACHIEVEMENT_META: Record<string, AchievementMeta> = {
  reviews_1: { fruitType: "apple", title: "First bite", rarity: "common" },
  reviews_25: { fruitType: "apple", title: "Crisp apple", rarity: "uncommon" },
  reviews_100: { fruitType: "apple", title: "Orchard regular", rarity: "rare" },
  accepts_1: { fruitType: "lemon", title: "First zest", rarity: "common" },
  accepts_25: { fruitType: "lemon", title: "Citrus stack", rarity: "uncommon" },
  study_days_3: {
    fruitType: "strawberry",
    title: "Three seeds",
    rarity: "uncommon",
  },
  study_days_14: {
    fruitType: "strawberry",
    title: "Fortnight berry",
    rarity: "rare",
  },
  clear_due_1: {
    fruitType: "pear",
    title: "Empty basket",
    rarity: "uncommon",
  },
  streak_7: {
    fruitType: "cherry",
    title: "Week of cherries",
    rarity: "rare",
  },
  streak_21: {
    fruitType: "cherry",
    title: "Triple cherry",
    rarity: "epic",
  },
  types_2: { fruitType: "kiwi", title: "Two slices", rarity: "rare" },
  plum_scholar: {
    fruitType: "plum",
    title: "Sugar plum",
    rarity: "legendary",
  },
};

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
