import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  computeCorrectionDiff,
  mergeSuggestionDiff,
  parseSuggestionBody,
  RESOLVE_CORRECTION_SQL,
  UPSERT_OPEN_SUGGESTION_SQL,
  type CurrentEntryState,
} from "../../../worker/atlas/corrections";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { ParasiteFields } from "../../../worker/atlas/templates/parasite";

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

function psoroptes() {
  return loadParasiteDataset().entries.find((e) => e.key === "psoroptes-ovis")!;
}

function stored(
  overrides: Partial<ParasiteFields> = {},
  learnerAliases: string[] = [],
): CurrentEntryState {
  const base = psoroptes();
  return {
    commonName: base.commonName,
    fields: { ...(base.fields as ParasiteFields), ...overrides },
    learnerAliases,
  };
}

describe("computeCorrectionDiff", () => {
  it("diffs only the selected keys, using stored values", () => {
    const base = psoroptes();
    const current = stored({ significance: "Causes sheep scab.", majorOrgan: "back" });
    expect(computeCorrectionDiff(base, current, ["significance"])).toEqual({
      significance: { from: base.fields.significance, to: "Causes sheep scab." },
    });
  });

  it("drops a selected key whose stored value equals the dataset", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored(), ["zoonotic"])).toEqual({});
  });

  it("diffs the common name and treats null as the dataset name", () => {
    const base = psoroptes();
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: "Scab mite" }, ["commonName"]),
    ).toEqual({ commonName: { from: base.commonName, to: "Scab mite" } });
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: null }, ["commonName"]),
    ).toEqual({});
  });

  it("treats stored learner aliases as additions to the dataset aliases", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored({}, ["Scab mite"]), ["aliases"])).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
    expect(computeCorrectionDiff(base, stored({}, []), ["aliases"])).toEqual({});
  });

  it("compares objects by value, not key order", () => {
    const base = psoroptes();
    const withPpp = { ...base, fields: { ...base.fields, pppDays: { min: 10, max: 14 } } };
    expect(
      computeCorrectionDiff(
        withPpp,
        {
          ...stored(),
          fields: { ...(withPpp.fields as ParasiteFields), pppDays: { max: 14, min: 10 } },
        },
        ["pppDays"],
      ),
    ).toEqual({});
  });
});

describe("mergeSuggestionDiff", () => {
  it("adds this save's keys and keeps earlier suggested keys", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ significance: "Earlier", majorOrgan: "back" }), [
        "majorOrgan",
      ]),
    ).toEqual({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
  });

  it("removes earlier keys whose stored value is back to the dataset", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ majorOrgan: "back" }), ["significance"]),
    ).toEqual({ majorOrgan: { from: base.fields.majorOrgan, to: "back" } });
  });
});

describe("parseSuggestionBody", () => {
  it("selects keys from the patch and trims note and link", () => {
    expect(
      parseSuggestionBody({
        patch: {
          fields: { significance: "x", notAField: 1 },
          commonName: "Scab mite",
          aliases: ["Scab mite"],
          canonicalName: "Psoroptes ovis",
        },
        note: "  per WOAH  ",
        sourceUrl: " https://example.org/scab ",
      }),
    ).toEqual({
      keys: ["significance", "commonName", "aliases"],
      canonicalName: "Psoroptes ovis",
      note: "per WOAH",
      sourceUrl: "https://example.org/scab",
    });
    expect(parseSuggestionBody({ patch: {} })).toEqual({
      keys: [],
      canonicalName: null,
      note: null,
      sourceUrl: null,
    });
  });

  it("rejects bad input", () => {
    expect(() => parseSuggestionBody({ patch: {}, note: "x".repeat(1001) })).toThrow(
      /at most 1000/,
    );
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "javascript:alert(1)" }),
    ).toThrow(/http or https/);
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "ftp://example.org/x" }),
    ).toThrow(/http or https/);
    expect(() => parseSuggestionBody({ note: "x" })).toThrow(/patch required/);
  });
});
