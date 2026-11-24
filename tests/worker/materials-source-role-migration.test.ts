import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
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

const NOW = "2026-11-09T00:00:00Z";

describe("0025_material_source_role migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
    ).run(NOW);
    db.prepare(
      "INSERT INTO decks (id, user_id, title, created_at) VALUES ('d1', 'u1', 'Deck', ?)",
    ).run(NOW);
  });

  it("defaults new rows to lecture and backfills via DEFAULT", () => {
    db.prepare(
      "INSERT INTO materials (id, deck_id, kind, status, created_at) VALUES ('m1', 'd1', 'pdf', 'ready', ?)",
    ).run(NOW);
    const row = db
      .prepare("SELECT source_role FROM materials WHERE id = 'm1'")
      .get() as { source_role: string };
    expect(row.source_role).toBe("lecture");
  });

  it("accepts every allowed source_role", () => {
    const roles = [
      "lecture",
      "tutorial",
      "practical",
      "past_paper",
      "notes",
    ] as const;
    for (const role of roles) {
      db.prepare(
        "INSERT INTO materials (id, deck_id, kind, status, created_at, source_role) VALUES (?, 'd1', 'pdf', 'ready', ?, ?)",
      ).run(`m-${role}`, NOW, role);
      const row = db
        .prepare("SELECT source_role FROM materials WHERE id = ?")
        .get(`m-${role}`) as { source_role: string };
      expect(row.source_role).toBe(role);
    }
  });

  it("rejects an unknown source_role via CHECK", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO materials (id, deck_id, kind, status, created_at, source_role) VALUES ('m-bad', 'd1', 'pdf', 'ready', ?, 'handout')",
        )
        .run(NOW),
    ).toThrow(/CHECK/);
  });
});

