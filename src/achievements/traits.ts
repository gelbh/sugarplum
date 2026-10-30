/** Wire types for traits derived by worker/gamification/traits.ts. */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type Shine = "low" | "mild" | "high" | "very_high" | "max";

export type FruitTraits = {
  shine: Shine;
  colour: string;
  status: string;
};
