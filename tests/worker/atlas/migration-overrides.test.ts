import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0042_atlas_entry_overrides migration", () => {
  it("adds nullable field_overrides_json and aliases_json", () => {
    const db = freshDb();
    expect(columnNames(db, "atlas_entries")).toEqual(
      expect.arrayContaining(["field_overrides_json", "aliases_json"]),
    );
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
    db.prepare(
      `INSERT INTO atlas_entries (id, atlas_id, canonical_name, common_name, fields_json, status, created_at, updated_at)
       VALUES ('e1', 'a1', 'Madeupius fictus', 'Imaginary worm', '{}', 'accepted', ?, ?)`,
    ).run(NOW, NOW);
    const row = db
      .prepare(
        "SELECT field_overrides_json, aliases_json FROM atlas_entries WHERE id = 'e1'",
      )
      .get() as { field_overrides_json: string | null; aliases_json: string | null };
    expect(row.field_overrides_json).toBeNull();
    expect(row.aliases_json).toBeNull();
  });
});
