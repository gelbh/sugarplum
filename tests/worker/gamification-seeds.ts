import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** One achievement_defs row as the migrations leave it. */
export type AchievementDefSeed = {
  id: string;
  category: string;
  fruit_type: string;
  rarity: string;
  trigger_kind: string;
  threshold: number | null;
  params_json: string | null;
  title: string;
  description: string;
  sort_order: number;
  active: number;
};

function loadDefsFromMigrations(): AchievementDefSeed[] {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("migrations").sort()) {
      db.exec(readFileSync(`migrations/${file}`, "utf8"));
    }
    return db
      .prepare(
        `SELECT id, category, fruit_type, rarity, trigger_kind, threshold,
                params_json, title, description, sort_order, active
         FROM achievement_defs ORDER BY sort_order`,
      )
      .all()
      .map((row) => ({ ...row }) as unknown as AchievementDefSeed);
  } finally {
    db.close();
  }
}

/** Fake D1 catalog: every migration applied to in-memory SQLite, so it cannot drift. */
export const ACHIEVEMENT_DEF_SEEDS: AchievementDefSeed[] =
  loadDefsFromMigrations();
