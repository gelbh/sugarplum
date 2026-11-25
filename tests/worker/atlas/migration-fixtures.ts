import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

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

export { freshDb, tableExists, columnNames, NOW };
