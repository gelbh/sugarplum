import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { runBackfillFieldOverrides } from "../../../worker/atlas/backfill-field-overrides";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";

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

/** Just enough D1 for the backfill, backed by real SQLite. */
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
        async run() {
          const info = stmt.run(...params);
          return { success: true, meta: { changes: Number(info.changes) } };
        },
        async all() {
          return { results: stmt.all(...params) };
        },
      };
      return bound;
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;
}

const entries = loadParasiteDataset().entries;
const dataset = entries.find((e) => e.key === "fasciola-hepatica")!;
const [second, third] = entries.filter((e) => e.key !== dataset.key);

type Stored = {
  id: string;
  field_overrides_json: string | null;
  common_name: string | null;
  fields_json: string;
};

describe("runBackfillFieldOverrides on real SQLite", () => {
  let db: DatabaseSync;

  function insert(
    id: string,
    atlasId: string,
    originKey: string | null,
    fieldsJson: string,
    deletedAt: string | null = null,
  ) {
    db.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, 1, ?, ?)`,
    ).run(id, atlasId, `${dataset.canonicalName} ${id}`, dataset.commonName,
      fieldsJson, NOW, NOW, originKey, NOW, deletedAt);
  }

  const stored = (id: string) =>
    db
      .prepare(
        "SELECT id, field_overrides_json, common_name, fields_json FROM atlas_entries WHERE id = ?",
      )
      .get(id) as Stored;

  beforeEach(() => {
    db = freshDb();
    for (const [user, atlas] of [["u1", "a1"], ["u2", "a2"]]) {
      db.prepare(
        "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
      ).run(user, `${user}@example.com`, NOW);
      db.prepare(
        "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES (?, ?, 'parasite', ?)",
      ).run(atlas, user, NOW);
    }
    const edited = JSON.stringify({ ...dataset.fields, significance: "Mine" });
    insert("legacy", "a1", "fasciola-hepatica", edited);
    insert("deleted", "a1", second.key, JSON.stringify(second.fields), NOW);
    insert("corrupt", "a1", third.key, "[1,2]");
    insert("retired", "a1", "no-such-parasite", edited);
    insert("learner", "a1", null, edited);
    insert("other-atlas", "a2", "fasciola-hepatica", edited);
  });

  it("converts only scoped legacy origin rows and reruns as a no-op", async () => {
    const d1 = asD1(db);
    const dry = await runBackfillFieldOverrides(d1, { dry_run: true, atlasId: "a1" });
    expect(dry).toEqual({
      scanned: 4,
      converted: 2,
      skipped: 1,
      skipped_corrupt: 1,
      dry_run: true,
    });
    expect(stored("legacy").field_overrides_json).toBeNull();

    const real = await runBackfillFieldOverrides(d1, { dry_run: false, atlasId: "a1" });
    expect(real).toEqual({ ...dry, dry_run: false });
    expect(JSON.parse(stored("legacy").field_overrides_json!)).toEqual({
      significance: "Mine",
    });
    expect(stored("legacy").common_name).toBeNull();
    expect(stored("deleted").field_overrides_json).toBe("{}");
    expect(stored("corrupt").field_overrides_json).toBeNull();
    expect(stored("corrupt").fields_json).toBe("[1,2]");
    expect(stored("retired").field_overrides_json).toBeNull();
    expect(stored("learner").field_overrides_json).toBeNull();
    expect(stored("other-atlas").field_overrides_json).toBeNull();

    const before = db.prepare("SELECT * FROM atlas_entries ORDER BY id").all();
    const rerun = await runBackfillFieldOverrides(d1, { dry_run: false, atlasId: "a1" });
    expect(rerun).toEqual({
      scanned: 2,
      converted: 0,
      skipped: 1,
      skipped_corrupt: 1,
      dry_run: false,
    });
    expect(db.prepare("SELECT * FROM atlas_entries ORDER BY id").all()).toEqual(before);
  });

  it("scopes by user", async () => {
    const result = await runBackfillFieldOverrides(asD1(db), {
      dry_run: false,
      userId: "u2",
    });
    expect(result).toMatchObject({ scanned: 1, converted: 1 });
    expect(stored("other-atlas").field_overrides_json).not.toBeNull();
    expect(stored("legacy").field_overrides_json).toBeNull();
  });
});
