import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { setFocusOverride } from "../../../worker/atlas/focus";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);
const NOW = "2026-11-20T00:00:00Z";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
  }
  return db;
}

/** Just enough D1 for setFocusOverride, backed by real SQLite. */
function asD1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      let params: SQLInputValue[] = [];
      const bound = {
        bind(...values: SQLInputValue[]) {
          params = values;
          return bound;
        },
        async first() {
          return stmt.get(...params) ?? null;
        },
        async run() {
          stmt.run(...params);
          return { success: true };
        },
        async all() {
          return { results: stmt.all(...params) };
        },
      };
      return bound;
    },
  } as unknown as D1Database;
}

describe("setFocusOverride on real SQLite", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
    db.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at, in_pack
       ) VALUES ('a1', 'psoroptes-ovis', 'standard', 'Standard', '["m1"]', NULL, ?, 1)`,
    ).run(NOW);
  });

  const stored = () =>
    db
      .prepare(
        "SELECT override, in_pack, material_ids_json FROM atlas_entry_focus WHERE entry_key = 'psoroptes-ovis'",
      )
      .get() as { override: string | null; in_pack: number; material_ids_json: string };

  it("keeps in_pack across pin and unpin", async () => {
    await setFocusOverride(asD1(db), "a1", "psoroptes-ovis", "key");
    expect(stored()).toEqual({
      override: "key",
      in_pack: 1,
      material_ids_json: '["m1"]',
    });
    await setFocusOverride(asD1(db), "a1", "psoroptes-ovis", null);
    expect(stored()).toEqual({
      override: null,
      in_pack: 1,
      material_ids_json: '["m1"]',
    });
  });
});
