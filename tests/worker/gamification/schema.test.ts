import { describe, it, expect } from "vitest";
import { FRUIT_ORDER } from "../../../src/achievements/catalog";
import { XP } from "../../../worker/gamification/constants";
import { TRIGGER_KINDS } from "../../../worker/gamification/evaluate";
import { ACHIEVEMENT_DEF_SEEDS } from "../gamification-seeds";

describe("achievement_defs after all migrations", () => {
  it("uses only known fruits, rarities, and trigger kinds", () => {
    expect(ACHIEVEMENT_DEF_SEEDS.length).toBeGreaterThan(0);
    for (const d of ACHIEVEMENT_DEF_SEEDS) {
      expect(FRUIT_ORDER, d.id).toContain(d.fruit_type);
      expect(Object.keys(XP.unlock), d.id).toContain(d.rarity);
      expect(TRIGGER_KINDS, d.id).toContain(d.trigger_kind);
      expect(d.trigger_kind === "composite" || d.threshold != null, d.id).toBe(
        true,
      );
    }
  });

  it("gives every fruit exactly one medal per rarity, in ladder order", () => {
    const ladder = Object.keys(XP.unlock);
    for (const fruit of FRUIT_ORDER) {
      const got = ACHIEVEMENT_DEF_SEEDS.filter((d) => d.fruit_type === fruit)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((d) => d.rarity);
      expect(got, fruit).toEqual(ladder);
    }
  });

  it("puts only the 12 shipped medals at catalog version 1", () => {
    const shipped = [
      "reviews_1",
      "reviews_25",
      "reviews_100",
      "accepts_1",
      "accepts_25",
      "study_days_3",
      "study_days_14",
      "clear_due_1",
      "streak_7",
      "streak_21",
      "types_2",
      "plum_scholar",
    ];
    expect(ACHIEVEMENT_DEF_SEEDS).toHaveLength(55);
    for (const d of ACHIEVEMENT_DEF_SEEDS) {
      expect(d.catalog_version, d.id).toBe(shipped.includes(d.id) ? 1 : 2);
    }
  });
});
