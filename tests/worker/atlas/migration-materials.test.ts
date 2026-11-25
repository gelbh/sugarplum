import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0033_atlas_materials migration", () => {
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

  it("creates atlas_materials with expected columns", () => {
    expect(tableExists(db, "atlas_materials")).toBe(true);
    expect(columnNames(db, "atlas_materials")).toEqual(
      expect.arrayContaining([
        "id",
        "atlas_id",
        "kind",
        "r2_key",
        "filename",
        "page_count",
        "status",
        "created_at",
        "content_hash",
        "source_role",
      ]),
    );
  });

  it("rejects image kind and cascades atlas delete", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_materials (
             id, atlas_id, kind, status, created_at, source_role
           ) VALUES ('m1', 'a1', 'image', 'ready', ?, 'tutorial')`,
        )
        .run(NOW),
    ).toThrow(/CHECK/);

    db.prepare(
      `INSERT INTO atlas_materials (
         id, atlas_id, kind, status, created_at, source_role
       ) VALUES ('m2', 'a1', 'paste', 'ready', ?, 'tutorial')`,
    ).run(NOW);
    db.prepare("DELETE FROM atlases WHERE id = 'a1'").run();
    const n = (
      db.prepare("SELECT COUNT(*) AS n FROM atlas_materials").get() as {
        n: number;
      }
    ).n;
    expect(n).toBe(0);
  });
});
