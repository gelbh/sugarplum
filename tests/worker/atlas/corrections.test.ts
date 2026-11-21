import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  RESOLVE_CORRECTION_SQL,
  UPSERT_OPEN_SUGGESTION_SQL,
} from "../../../worker/atlas/corrections";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

const T0 = "2026-11-20T00:00:00.000Z";
const T1 = "2026-11-20T00:01:00.000Z";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
  }
  db.prepare(
    "INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', ?)",
  ).run(T0);
  db.prepare(
    "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES ('a1', 'u1', 'parasite', ?)",
  ).run(T0);
  return db;
}

function upsert(
  db: DatabaseSync,
  id: string,
  diffJson: string,
  note: string | null,
  createdAt: string,
) {
  db.prepare(UPSERT_OPEN_SUGGESTION_SQL).run(
    id,
    "u1",
    "a1",
    "psoroptes-ovis",
    9,
    diffJson,
    note,
    null,
    createdAt,
  );
}

function rows(db: DatabaseSync) {
  return (
    db
      .prepare(
        "SELECT id, status, diff_json, note FROM atlas_correction_suggestions ORDER BY created_at",
      )
      .all() as Array<Record<string, unknown>>
  ).map((r) => ({ ...r }));
}

describe("0043 atlas_correction_suggestions (real SQLite)", () => {
  it("keeps one open row per user and parasite; a repeat upsert updates it", () => {
    const db = freshDb();
    upsert(db, "s1", '{"a":1}', "first", T0);
    upsert(db, "s2", '{"b":2}', null, T1);
    expect(rows(db)).toEqual([
      { id: "s1", status: "open", diff_json: '{"b":2}', note: "first" },
    ]);
  });

  it("resolves only open rows and then allows a new open row", () => {
    const db = freshDb();
    upsert(db, "s1", '{"a":1}', null, T0);
    const first = db
      .prepare(RESOLVE_CORRECTION_SQL)
      .run("accepted", T1, "admin", "s1");
    expect(Number(first.changes)).toBe(1);
    const again = db
      .prepare(RESOLVE_CORRECTION_SQL)
      .run("rejected", T1, "admin", "s1");
    expect(Number(again.changes)).toBe(0);
    upsert(db, "s2", '{"b":2}', null, T1);
    expect(rows(db).map((r) => [r.id, r.status])).toEqual([
      ["s1", "accepted"],
      ["s2", "open"],
    ]);
  });

  it("rejects statuses outside open, accepted, rejected", () => {
    const db = freshDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO atlas_correction_suggestions (id, user_id, atlas_id, origin_key, dataset_version, diff_json, status, created_at) VALUES ('x', 'u1', 'a1', 'k', 9, '{}', 'pending', ?)",
        )
        .run(T0),
    ).toThrow(/CHECK constraint failed/);
  });
});
