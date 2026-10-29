/** KEEP IN SYNC with worker/gamification/traits.ts */

export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type Shine = "low" | "mild" | "high" | "very_high" | "max";

export type FruitTraits = {
  shine: Shine;
  colour: string;
  status: string;
};

const SHINE_BY_RARITY: Record<Rarity, Shine> = {
  common: "low",
  uncommon: "mild",
  rare: "high",
  epic: "very_high",
  legendary: "max",
};

const COLOUR_POOLS: Record<Rarity, readonly string[]> = {
  common: ["dull", "muted"],
  uncommon: ["clearer", "soft"],
  rare: ["bright", "vivid_soft"],
  epic: ["vivid", "rich"],
  legendary: ["signature", "golden"],
};

const STATUS_POOLS: Record<Rarity, readonly string[]> = {
  common: ["bruised", "unripe"],
  uncommon: ["edible", "firm"],
  rare: ["ripe", "juicy"],
  epic: ["ripe", "glossy"],
  legendary: ["perfect", "flawless"],
};

/** ponytail: djb2-style hash; fine for small achievement id set */
function hashAchievementId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(33, h) + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function traitsForAchievement(
  achievementId: string,
  rarity: Rarity,
): FruitTraits {
  const h = hashAchievementId(achievementId);
  const colours = COLOUR_POOLS[rarity];
  const statuses = STATUS_POOLS[rarity];
  return {
    shine: SHINE_BY_RARITY[rarity],
    colour: colours[h % colours.length]!,
    status: statuses[h % statuses.length]!,
  };
}
