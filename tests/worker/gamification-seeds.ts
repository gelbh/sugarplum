import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

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
  catalog_version: number;
};

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

function loadDefsFromMigrations(): AchievementDefSeed[] {
  const db = new DatabaseSync(":memory:");
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
    }
    return db
      .prepare(
        `SELECT id, category, fruit_type, rarity, trigger_kind, threshold,
                params_json, title, description, sort_order, active, catalog_version
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
