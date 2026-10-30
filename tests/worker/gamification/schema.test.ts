import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ACHIEVEMENT_DEF_SEEDS } from "../gamification-seeds";

describe("0015_gamification seed", () => {
  it("includes all v1 achievement ids", () => {
    const sql = readFileSync("migrations/0015_gamification.sql", "utf8");
    for (const id of [
      "reviews_1", "reviews_25", "reviews_100",
      "accepts_1", "accepts_25",
      "study_days_3", "study_days_14",
      "clear_due_1", "streak_7", "streak_21",
      "types_2", "plum_scholar",
    ]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql).toContain("xp_ledger");
    expect(sql).toContain("user_gamification");
  });

  it("matches the test seeds field for field on display columns", () => {
    const sql = readFileSync("migrations/0015_gamification.sql", "utf8");
    for (const s of ACHIEVEMENT_DEF_SEEDS) {
      const start = sql.indexOf(`('${s.id}',`);
      expect(start, s.id).toBeGreaterThan(-1);
      const next = sql.indexOf("\n  ('", start + 1);
      const tuple = sql.slice(start, next === -1 ? undefined : next);
      for (const v of [s.category, s.fruit_type, s.rarity, s.trigger_kind, s.title]) {
        expect(tuple, `${s.id}.${v}`).toContain(`'${v.replace(/'/g, "''")}'`);
      }
    }
  });
});
