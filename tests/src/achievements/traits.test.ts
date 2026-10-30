import { describe, it, expect } from "vitest";
import { ACHIEVEMENT_DEF_SEEDS } from "../../worker/gamification-seeds";
import { traitsForAchievement as workerTraits } from "../../../worker/gamification/traits";
import {
  traitsForAchievement as clientTraits,
  type Rarity,
} from "../../../src/achievements/traits";

describe("client traitsForAchievement parity", () => {
  for (const seed of ACHIEVEMENT_DEF_SEEDS) {
    it(`${seed.id} matches worker for ${seed.rarity}`, () => {
      const rarity = seed.rarity as Rarity;
      expect(clientTraits(seed.id, rarity)).toEqual(
        workerTraits(seed.id, rarity),
      );
    });
  }
});
