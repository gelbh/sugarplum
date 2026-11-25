import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0041_atlas_entry_focus_in_pack migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
  });

  it("adds in_pack defaulting to 0 for rows written without it", () => {
    expect(columnNames(db, "atlas_entry_focus")).toContain("in_pack");
    db.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES ('a1', 'psoroptes-ovis', 'standard', 'Standard', '[]', NULL, ?)`,
    ).run(NOW);
    const row = db
      .prepare(
        "SELECT in_pack FROM atlas_entry_focus WHERE entry_key = 'psoroptes-ovis'",
      )
      .get() as { in_pack: number };
    expect(row.in_pack).toBe(0);
  });
});
