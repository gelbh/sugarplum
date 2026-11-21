import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "../../worker/db/client";

describe("isUniqueViolation", () => {
  it("recognizes a real SQLite UNIQUE failure and nothing else", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (a TEXT, b TEXT, UNIQUE (a, b))");
    db.exec("INSERT INTO t VALUES ('x', 'y')");
    let caught: unknown;
    try {
      db.exec("INSERT INTO t VALUES ('x', 'y')");
    } catch (err) {
      caught = err;
    }
    expect(isUniqueViolation(caught)).toBe(true);
    expect(isUniqueViolation(new Error("D1_ERROR: UNIQUE constraint failed: t.a"))).toBe(true);
    expect(isUniqueViolation(new Error("no such table: t"))).toBe(false);
    expect(isUniqueViolation(new Error("NOT NULL constraint failed: t.a"))).toBe(false);
  });
});
