import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

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
});
