import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

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

describe("GET /api/materials", () => {
  it("returns owner materials with deck_title and excludes other users", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Anatomy",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedMaterial(env, {
      id: "mine-old",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mine-old.txt",
      filename: "old.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mine-new",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mine-new.png",
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T03:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "figure-hidden",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T03:30:00.000Z",
    });
    await seedMaterial(env, {
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
    expect(body.some((row) => row.id === "figure-hidden")).toBe(false);
  });
});
