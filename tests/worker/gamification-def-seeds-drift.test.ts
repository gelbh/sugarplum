import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_DEF_SEEDS } from "./gamification-seeds";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

type DefRow = {
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

describe("gamification-def-seeds.json drift", () => {
  it("matches achievement_defs after all migrations", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (const file of readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
    }
    const rows = db
      .prepare(
        `SELECT id, category, fruit_type, rarity, trigger_kind, threshold,
                params_json, title, description, sort_order, active, catalog_version
         FROM achievement_defs
         ORDER BY sort_order, id`,
      )
      .all() as DefRow[];
    const snapshot = [...ACHIEVEMENT_DEF_SEEDS].sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.id.localeCompare(b.id),
    );
    expect(rows).toEqual(snapshot);
  });
});
