import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  FREE_GEN_DAILY_CAP,
  RELEASE_FREE_GEN_SQL,
  RESERVE_FREE_GEN_SQL,
} from "../../../worker/generation/quota";

describe("free-gen quota SQL", () => {
  it("reserve stops at the cap and release floors at zero", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
    db.exec(
      readFileSync(
        new URL("../../../migrations/0021_free_gen_usage.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    ).run("u-sql", "sql@example.com", "2026-10-30T00:00:00Z");

    const reserve = db.prepare(RESERVE_FREE_GEN_SQL);
    const reserved: number[] = [];
    for (let i = 0; i < FREE_GEN_DAILY_CAP + 1; i++) {
      const row = reserve.get("u-sql", "2026-10-30", FREE_GEN_DAILY_CAP) as
        | { used: number }
        | undefined;
      if (row) reserved.push(row.used);
    }
    expect(reserved).toEqual(
      Array.from({ length: FREE_GEN_DAILY_CAP }, (_, i) => i + 1),
    );

    const release = db.prepare(RELEASE_FREE_GEN_SQL);
    for (let i = 0; i < FREE_GEN_DAILY_CAP + 1; i++) {
      release.run("u-sql", "2026-10-30");
    }
    const used = db
      .prepare(
        "SELECT used FROM free_gen_usage WHERE user_id = ? AND day = ?",
      )
      .get("u-sql", "2026-10-30");
    expect(used).toMatchObject({ used: 0 });
  });
});
