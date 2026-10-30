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
});
