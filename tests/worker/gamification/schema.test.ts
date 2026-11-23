import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { FRUIT_ORDER } from "../../../src/achievements/catalog";
import { XP } from "../../../worker/gamification/constants";
import { TRIGGER_KINDS } from "../../../worker/gamification/evaluate";
import { ACHIEVEMENT_DEF_SEEDS } from "../gamification-seeds";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

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

  const TARGET_THRESHOLDS: Record<string, number> = {
    reviews_1: 1,
    reviews_25: 50,
    reviews_100: 250,
    reviews_500: 1000,
    reviews_2000: 5000,
    accepts_1: 1,
    accepts_25: 50,
    accepts_100: 250,
    accepts_300: 750,
    accepts_1000: 2500,
    study_days_2: 2,
    study_days_3: 7,
    study_days_14: 30,
    study_days_50: 100,
    study_days_150: 250,
    library_2: 2,
    library_3: 5,
    library_5: 10,
    library_10: 25,
    library_20: 50,
    clear_due_1: 1,
    clear_due_3: 7,
    clear_due_10: 21,
    clear_due_30: 60,
    clear_due_100: 180,
    long_reviews_1: 1,
    long_reviews_10: 25,
    long_reviews_50: 100,
    long_reviews_150: 350,
    long_reviews_400: 1000,
    mature_1: 1,
    mature_10: 25,
    mature_50: 100,
    mature_200: 400,
    mature_500: 1000,
    streak_3: 3,
    streak_5: 7,
    streak_7: 14,
    streak_21: 45,
    streak_60: 120,
    types_2: 2,
    types_3: 3,
    types_4: 4,
    types_5: 5,
    types_6: 6,
    level_3: 3,
    level_5: 8,
    level_10: 14,
    level_15: 20,
    level_20: 28,
  };

  const TARGET_PLUM: Record<
    string,
    { streak_best_min: number; reviews_min: number }
  > = {
    plum_bud: { streak_best_min: 3, reviews_min: 25 },
    plum_blossom: { streak_best_min: 7, reviews_min: 100 },
    plum_ripening: { streak_best_min: 14, reviews_min: 250 },
    plum_orchard: { streak_best_min: 30, reviews_min: 750 },
    plum_scholar: { streak_best_min: 60, reviews_min: 2000 },
  };

  it("matches the harder fruit ladder thresholds", () => {
    const byId = Object.fromEntries(
      ACHIEVEMENT_DEF_SEEDS.map((d) => [d.id, d]),
    );
    for (const [id, threshold] of Object.entries(TARGET_THRESHOLDS)) {
      expect(byId[id]?.threshold, id).toBe(threshold);
    }
    for (const [id, params] of Object.entries(TARGET_PLUM)) {
      expect(JSON.parse(byId[id]!.params_json!), id).toEqual(params);
    }
  });

  it("keeps kiwi at the type-ceiling ladder", () => {
    const kiwi = ACHIEVEMENT_DEF_SEEDS.filter(
      (d) => d.fruit_type === "kiwi",
    ).sort((a, b) => a.sort_order - b.sort_order);
    expect(kiwi.map((d) => d.threshold)).toEqual([2, 3, 4, 5, 6]);
  });

  it("retune migration syncs stale achievement_progress thresholds", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files) {
        if (file === "0044_harder_fruit_ladders.sql") {
          db.exec(
            `INSERT INTO users (id, email, password_hash, oauth_subject, created_at)
             VALUES ('u-stale', 'stale@test.com', NULL, NULL, '2026-01-01T00:00:00.000Z');
             INSERT INTO achievement_progress
               (user_id, achievement_id, current_value, threshold)
             VALUES ('u-stale', 'reviews_25', 10, 25);`,
          );
        }
        db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
      }
      const row = db
        .prepare(
          `SELECT threshold FROM achievement_progress
           WHERE user_id = 'u-stale' AND achievement_id = 'reviews_25'`,
        )
        .get() as { threshold: number };
      expect(row.threshold).toBe(50);
    } finally {
      db.close();
    }
  });
});
