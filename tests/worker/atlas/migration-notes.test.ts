import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0039_atlas_entry_notes migration", () => {
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

  it("creates atlas_entry_notes with expected columns", () => {
    expect(tableExists(db, "atlas_entry_notes")).toBe(true);
    expect(columnNames(db, "atlas_entry_notes")).toEqual(
      expect.arrayContaining([
        "atlas_id",
        "entry_key",
        "body",
        "updated_at",
      ]),
    );
  });

  it("enforces primary key on (atlas_id, entry_key)", () => {
    db.prepare(
      `INSERT INTO atlas_entry_notes (atlas_id, entry_key, body, updated_at)
       VALUES ('a1', 'fasciola-hepatica', 'PPP tip', ?)`,
    ).run(NOW);
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_notes (atlas_id, entry_key, body, updated_at)
           VALUES ('a1', 'fasciola-hepatica', 'dup', ?)`,
        )
        .run(NOW),
    ).toThrow(/UNIQUE|constraint/i);
  });

  it("rejects empty body", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_notes (atlas_id, entry_key, body, updated_at)
           VALUES ('a1', 'fasciola-hepatica', '', ?)`,
        )
        .run(NOW),
    ).toThrow(/CHECK|constraint/i);
  });
});
