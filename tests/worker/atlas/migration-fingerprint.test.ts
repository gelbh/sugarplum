import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0036_atlas_focus_pack_fingerprint migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
  });

  it("adds nullable focus_pack_fingerprint on atlases", () => {
    expect(columnNames(db, "atlases")).toEqual(
      expect.arrayContaining(["focus_pack_fingerprint"]),
    );
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
    const row = db
      .prepare(
        "SELECT focus_pack_fingerprint AS fp FROM atlases WHERE id = 'a1'",
      )
      .get() as { fp: string | null };
    expect(row.fp).toBeNull();
  });
});
