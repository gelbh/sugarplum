import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

type MaterialListRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  deck_title?: string;
};

describe("GET /api/decks/:id/materials", () => {
  it("lists paste and figure materials for the deck owner", async () => {
    const env = createTestEnv();
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
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MaterialListRow[];
    expect(body.map((row) => row.id)).toEqual(["figure-1", "paste-1"]);
    expect(body[0]).toMatchObject({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      status: "ready",
    });
    expect(body[1]).toMatchObject({
      id: "paste-1",
      kind: "paste",
      filename: "notes.txt",
    });
  });

  it("returns 404 when listing another user's deck materials", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
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
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/materials", () => {
  it("returns owner materials with deck_title and excludes other users", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Anatomy",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "mine-old",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mine-old.txt",
      filename: "old.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "mine-new",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T03:00:00.000Z",
    });
    env.seedMaterial({
      id: "theirs",
      deck_id: "deck-b",
      kind: "paste",
      r2_key: "materials/deck-b/theirs.txt",
      filename: "theirs.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T04:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MaterialListRow[];
    expect(body.map((row) => row.id)).toEqual(["mine-new", "mine-old"]);
    expect(body.every((row) => row.deck_title === "Anatomy")).toBe(true);
    expect(body.some((row) => row.id === "theirs")).toBe(false);
  });
});
