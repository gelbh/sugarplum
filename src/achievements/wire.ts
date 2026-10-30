/** API wire types shared by the Worker (producer) and the client (consumer). */
import type { FruitType } from "./catalog";
import type { FruitTraits, Rarity } from "./traits";

/** Server-built unlock; toasts render it without a client catalog. */
export type UnlockView = {
  id: string;
  title: string;
  fruitType: FruitType;
  rarity: Rarity;
  traits: FruitTraits;
};

export type CompositePart = {
  key: "streak_best" | "reviews";
  current: number;
  target: number;
};

export type AchievementProgress =
  | { kind: "count"; currentValue: number; threshold: number }
  | { kind: "composite"; parts: CompositePart[] }
  | null;

export type AchievementDef = {
  id: string;
  category: string;
  fruitType: FruitType;
  rarity: Rarity;
  title: string;
  description: string;
  sortOrder: number;
};

export type AchievementItem = {
  def: AchievementDef;
  progress: AchievementProgress;
  completedAt: string | null;
  traits: FruitTraits;
};
