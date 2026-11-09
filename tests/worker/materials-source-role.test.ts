import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

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

describe("materials source_role API", () => {
  function seedOwner(env: ReturnType<typeof createTestEnv>) {
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
  }

  it("persists suggested role on paste and returns it from list", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const create = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "tutorial body",
          filename: "Week2_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; source_role: string };
    expect(created.source_role).toBe("tutorial");
    expect(env.getMaterials()[0]?.source_role).toBe("tutorial");

    const list = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{
      id: string;
      source_role: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_role).toBe("tutorial");
  });

  it("accepts an explicit source_role override on paste", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const create = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          filename: "Week2_TUTORIAL.pdf",
          source_role: "notes",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { source_role: string };
    expect(created.source_role).toBe("notes");
  });

  it("patches source_role on an owned material", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "lecture",
    });

    const patch = await app.request(
      "/api/materials/mat-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ source_role: "past_paper" }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { source_role: string };
    expect(body.source_role).toBe("past_paper");
    expect(env.getMaterials()[0]?.source_role).toBe("past_paper");
  });

  it("rejects an invalid source_role on patch", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: null,
      filename: "x.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "lecture",
    });

    const patch = await app.request(
      "/api/materials/mat-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ source_role: "handout" }),
      },
      env,
    );
    expect(patch.status).toBe(400);
  });
});
