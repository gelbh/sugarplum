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

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { ok: number } | undefined;
  return row !== undefined;
}

function columnNames(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((c) => c.name);
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

  it("cascades a subject delete through atlas and entries", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    db.prepare("DELETE FROM decks WHERE id = 'd1'").run();
    db.prepare("DELETE FROM subjects WHERE id = 's1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    expect(count("atlases")).toBe(0);
    expect(count("atlas_entries")).toBe(0);
  });
});

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
      "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES ('a1', 's1', 'parasite', ?)",
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

  it("cascades a subject delete through refs and images", () => {
    db.prepare("DELETE FROM materials WHERE id = 'm1'").run();
    db.prepare("DELETE FROM decks WHERE id = 'd1'").run();
    db.prepare("DELETE FROM subjects WHERE id = 's1'").run();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    expect(count("atlases")).toBe(0);
    expect(count("atlas_entries")).toBe(0);
    expect(count("atlas_entry_refs")).toBe(0);
    expect(count("atlas_entry_images")).toBe(0);
  });
});

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
      "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES ('a1', 's1', 'parasite', ?)",
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
