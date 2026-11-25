import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0026_atlas_entry_focus migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO subjects (id, user_id, title, created_at) VALUES ('s1', 'u1', 'Parasitology', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
  });

  it("creates atlas_entry_focus with expected columns", () => {
    expect(tableExists(db, "atlas_entry_focus")).toBe(true);
    expect(columnNames(db, "atlas_entry_focus")).toEqual(
      expect.arrayContaining([
        "atlas_id",
        "entry_key",
        "tier",
        "reason",
        "material_ids_json",
        "override",
        "updated_at",
      ]),
    );
  });

  it("enforces primary key on (atlas_id, entry_key)", () => {
    db.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES ('a1', 'fasciola-hepatica', 'key', 'Named', '[]', NULL, ?)`,
    ).run(NOW);
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_focus (
             atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
           ) VALUES ('a1', 'fasciola-hepatica', 'standard', 'Standard', '[]', NULL, ?)`,
        )
        .run(NOW),
    ).toThrow(/UNIQUE|PRIMARY/);
  });

  it("rejects invalid tier and override via CHECK", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_focus (
             atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
           ) VALUES ('a1', 'k1', 'vip', 'x', '[]', NULL, ?)`,
        )
        .run(NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_focus (
             atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
           ) VALUES ('a1', 'k2', 'key', 'x', '[]', 'vip', ?)`,
        )
        .run(NOW),
    ).toThrow(/CHECK/);
  });

  it("cascades atlas delete through focus rows", () => {
    db.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES ('a1', 'fasciola-hepatica', 'key', 'Named', '[]', NULL, ?)`,
    ).run(NOW);
    db.prepare("DELETE FROM atlases WHERE id = 'a1'").run();
    const n = (
      db.prepare("SELECT COUNT(*) AS n FROM atlas_entry_focus").get() as {
        n: number;
      }
    ).n;
    expect(n).toBe(0);
  });
});
