import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { freshDb, columnNames, tableExists, NOW } from "./migration-fixtures";

describe("0024_atlas_dataset migration", () => {
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
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         origin_key, origin_version, edited_at, deleted_at, created_at, updated_at
       ) VALUES (
         'e1', 'a1', 'Dipylidium caninum', 'Double pored dog tapeworm', '{}', 'accepted',
         'dipylidium-caninum', 1, NULL, NULL, ?, ?
       )`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO atlas_entry_refs (
         id, entry_id, field_key, citation, url, material_id, page, note, user_added, created_at
       ) VALUES (
         'r1', 'e1', 'family', 'CDC DPDx', 'https://example.com/dpdx', 'm1', 9,
         'Course lists a different family', 0, ?
       )`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO atlas_entry_images (
         id, entry_id, src, role, caption, credit, license, source_url,
         is_hero, user_added, deleted_at, created_at
       ) VALUES (
         'i1', 'e1', '/atlas/parasites/dipylidium-adult.webp', 'adult',
         'Adult', 'CDC', 'Public Domain', 'https://example.com/img',
         1, 0, NULL, ?
       )`,
    ).run(NOW);
  });

  it("adds overlay columns on atlas_entries", () => {
    const cols = columnNames(db, "atlas_entries");
    expect(cols).toEqual(
      expect.arrayContaining([
        "origin_key",
        "origin_version",
        "edited_at",
        "deleted_at",
      ]),
    );
    const row = db
      .prepare(
        `SELECT origin_key, origin_version, edited_at, deleted_at
         FROM atlas_entries WHERE id = 'e1'`,
      )
      .get() as {
      origin_key: string;
      origin_version: number;
      edited_at: string | null;
      deleted_at: string | null;
    };
    expect(row).toEqual({
      origin_key: "dipylidium-caninum",
      origin_version: 1,
      edited_at: null,
      deleted_at: null,
    });
  });

  it("allows learner-added entries with a null origin_key", () => {
    db.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, fields_json, status, origin_key, created_at, updated_at
       ) VALUES ('e2', 'a1', 'Learner parasite', '{}', 'accepted', NULL, ?, ?)`,
    ).run(NOW, NOW);
    const row = db
      .prepare("SELECT origin_key FROM atlas_entries WHERE id = 'e2'")
      .get() as { origin_key: string | null };
    expect(row.origin_key).toBeNull();
  });

  it("enforces unique origin_key per atlas when set", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entries (
             id, atlas_id, canonical_name, fields_json, status, origin_key, created_at, updated_at
           ) VALUES ('e-dup', 'a1', 'Dipylidium caninum overlay', '{}', 'accepted',
             'dipylidium-caninum', ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/UNIQUE/);

    db.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, fields_json, status, origin_key, created_at, updated_at
       ) VALUES ('e3', 'a1', 'Learner A', '{}', 'accepted', NULL, ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, fields_json, status, origin_key, created_at, updated_at
       ) VALUES ('e4', 'a1', 'Learner B', '{}', 'accepted', NULL, ?, ?)`,
    ).run(NOW, NOW);
    const nulls = db
      .prepare(
        `SELECT COUNT(*) AS n FROM atlas_entries
         WHERE atlas_id = 'a1' AND origin_key IS NULL`,
      )
      .get() as { n: number };
    expect(nulls.n).toBe(2);
  });

  it("drops atlas_field_sources", () => {
    expect(tableExists(db, "atlas_field_sources")).toBe(false);
  });

  it("creates atlas_entry_refs with the expected columns", () => {
    expect(tableExists(db, "atlas_entry_refs")).toBe(true);
    expect(columnNames(db, "atlas_entry_refs")).toEqual(
      expect.arrayContaining([
        "id",
        "entry_id",
        "field_key",
        "citation",
        "url",
        "material_id",
        "page",
        "note",
        "user_added",
        "created_at",
      ]),
    );
  });

  it("creates atlas_entry_images with the expected columns", () => {
    expect(tableExists(db, "atlas_entry_images")).toBe(true);
    expect(columnNames(db, "atlas_entry_images")).toEqual(
      expect.arrayContaining([
        "id",
        "entry_id",
        "src",
        "role",
        "caption",
        "credit",
        "license",
        "source_url",
        "is_hero",
        "user_added",
        "deleted_at",
        "created_at",
      ]),
    );
  });

  it("allows a whole-entry ref with a null field_key", () => {
    db.prepare(
      `INSERT INTO atlas_entry_refs (id, entry_id, field_key, citation, created_at)
       VALUES ('r2', 'e1', NULL, 'WCVM Learn About Parasites', ?)`,
    ).run(NOW);
    const row = db
      .prepare("SELECT field_key FROM atlas_entry_refs WHERE id = 'r2'")
      .get() as { field_key: string | null };
    expect(row.field_key).toBeNull();
  });

  it("rejects an unknown image role", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO atlas_entry_images (id, entry_id, src, role, created_at)
           VALUES ('i2', 'e1', '/x.webp', 'micrograph', ?)`,
        )
        .run(NOW),
    ).toThrow(/CHECK/);
  });

  it("nulls material_id on refs when the material is deleted", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    const row = db
      .prepare("SELECT material_id FROM atlas_entry_refs WHERE id = 'r1'")
      .get() as { material_id: string | null };
    expect(row.material_id).toBeNull();
  });

  it("cascades entry delete through refs and images", () => {
    db.prepare("DELETE FROM atlas_entries WHERE id = 'e1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    expect(count("atlas_entry_refs")).toBe(0);
    expect(count("atlas_entry_images")).toBe(0);
  });

  it("cascades a user delete through refs and images", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    db.prepare("DELETE FROM decks WHERE id = 'd1'").run();
    db.prepare("DELETE FROM subjects WHERE id = 's1'").run();
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    expect(count("atlases")).toBe(0);
    expect(count("atlas_entries")).toBe(0);
    expect(count("atlas_entry_refs")).toBe(0);
    expect(count("atlas_entry_images")).toBe(0);
  });
});
