import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

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

const NOW = "2026-11-08T00:00:00Z";

describe("0023_atlas migration", () => {
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
      "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES ('a1', 's1', 'parasite', ?)",
    ).run(NOW);
    db.prepare(
      `INSERT INTO atlas_entries (id, atlas_id, canonical_name, common_name, fields_json, status, created_at, updated_at)
       VALUES ('e1', 'a1', 'Dipylidium caninum', 'Double pored dog tapeworm', '{}', 'draft', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO atlas_field_sources (id, entry_id, field_key, material_id, page, value_json, excerpt, created_at)
       VALUES ('f1', 'e1', 'family', 'm1', 9, '"Diphyllobothriidae"', 'Diphyllobothriidae', ?)`,
    ).run(NOW);
  });

  it("allows one atlas per subject", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES ('a2', 's1', 'parasite', ?)",
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
          "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES ('a2', 's2', 'drug', ?)",
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

  it("rejects a duplicate source for the same field and page", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_field_sources (id, entry_id, field_key, material_id, page, value_json, excerpt, created_at)
           VALUES ('f2', 'e1', 'family', 'm1', 9, '"Diphyllobothriidae"', 'x', ?)`,
        )
        .run(NOW),
    ).toThrow(/UNIQUE/);
  });

  it("cascades a subject delete through atlas, entries and sources", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    db.prepare("DELETE FROM decks WHERE id = 'd1'").run();
    db.prepare("DELETE FROM subjects WHERE id = 's1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count("atlases")).toBe(0);
    expect(count("atlas_entries")).toBe(0);
    expect(count("atlas_field_sources")).toBe(0);
  });

  it("drops sources when their material is deleted", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    const n = (
      db.prepare("SELECT COUNT(*) AS n FROM atlas_field_sources").get() as { n: number }
    ).n;
    expect(n).toBe(0);
  });
});
