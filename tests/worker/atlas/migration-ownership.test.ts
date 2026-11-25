import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("atlas ownership migration", () => {
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
      "INSERT INTO decks (id, user_id, title, created_at, subject_id) VALUES ('d1', 'u1', 'Cestodes', ?, 's1')",
    ).run(NOW);
    db.prepare(
      "INSERT INTO materials (id, deck_id, kind, status, created_at) VALUES ('m1', 'd1', 'pdf', 'ready', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
    ).run(NOW);
    db.prepare(
      `INSERT INTO atlas_entries (id, atlas_id, canonical_name, common_name, fields_json, status, created_at, updated_at)
       VALUES ('e1', 'a1', 'Dipylidium caninum', 'Double pored dog tapeworm', '{}', 'draft', ?, ?)`,
    ).run(NOW, NOW);
  });

  it("allows one atlas per user and template", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a2', 'u1', 'parasite', ?)",
        )
        .run(NOW),
    ).toThrow(/UNIQUE/);
  });

  it("rejects an unknown template key", () => {
    db.prepare(
      "INSERT INTO subjects (id, user_id, title, created_at) VALUES ('s2', 'u1', 'Other', ?)",
    ).run(NOW);
    expect(() =>
      db
        .prepare(
          "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a2', 'u1', 'drug', ?)",
        )
        .run(NOW),
    ).toThrow(/CHECK/);
  });

  it("keeps canonical names unique per atlas", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entries (id, atlas_id, canonical_name, fields_json, status, created_at, updated_at)
           VALUES ('e2', 'a1', 'Dipylidium caninum', '{}', 'draft', ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/UNIQUE/);
  });

  it("rejects an unknown entry status", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entries (id, atlas_id, canonical_name, fields_json, status, created_at, updated_at)
           VALUES ('e2', 'a1', 'Taenia ovis', '{}', 'published', ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  it("cascades a user delete through atlas and entries", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    db.prepare("DELETE FROM decks WHERE id = 'd1'").run();
    db.prepare("DELETE FROM subjects WHERE id = 's1'").run();
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    expect(count("atlases")).toBe(0);
    expect(count("atlas_entries")).toBe(0);
  });

  it("stores user_id on atlases after 0027", () => {
    expect(columnNames(db, "atlases")).toEqual(
      expect.arrayContaining(["id", "user_id", "template_key", "created_at"]),
    );
    expect(columnNames(db, "atlases")).not.toContain("subject_id");
  });
});
