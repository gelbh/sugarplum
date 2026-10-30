import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_META } from "../../../src/achievements/catalog";
import { ACHIEVEMENT_DEF_SEEDS } from "../../worker/gamification-seeds";

describe("ACHIEVEMENT_META", () => {
  it("matches the achievement_defs seed for every toastable id", () => {
    const fromSeeds = Object.fromEntries(
      ACHIEVEMENT_DEF_SEEDS.map((s) => [
        s.id,
        { fruitType: s.fruit_type, title: s.title, rarity: s.rarity },
      ]),
    );
    expect(ACHIEVEMENT_META).toEqual(fromSeeds);
  });
});
