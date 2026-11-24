import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getR2,
  getReviewLogs,
  getSchedules,
  resetTestDb,
  seedCard,
  seedDeck,
  seedR2,
  seedReviewLog,
  seedSchedule,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const PAST_DUE = "2020-01-01T00:00:00.000Z";

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

async function seedCardFixture(
  env: Bindings,
  opts: { id: string; status: string; media?: string | null },
) {
  await seedCard(env, {
    id: opts.id,
    deck_id: "deck-a",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("Q?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: opts.media ?? null,
    provenance_json: null,
    status: opts.status,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
}

function del(
  env: Bindings,
  cardId: string,
  sessionId = "sess-a",
) {
  return app.request(
    `/api/cards/${cardId}`,
    {
      method: "DELETE",
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
    },
    env,
  );
}

describe("DELETE /api/cards/:id", () => {
  it("removes an accepted card, its schedule, and its review logs", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCardFixture(env, {
      id: "card-1",
      status: "accepted",
      media: JSON.stringify(["materials/user-a/fig.png"]),
    });
    await seedR2(env, "materials/user-a/fig.png", "png-bytes");
    await seedSchedule(env, {
      card_id: "card-1",
      due: PAST_DUE,
      stability: 2.5,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 4,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2020-05-28T00:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "log-1",
      card_id: "card-1",
      rating: 3,
      scheduled_days: 4,
      elapsed_days: 3,
      reviewed_at: "2020-05-28T00:00:00.000Z",
      state_json: "{}",
    });

    const res = await del(env, "card-1");
    expect(res.status).toBe(204);
    expect((await getCards(env)).some((c) => c.id === "card-1")).toBe(false);
    expect((await getSchedules(env)).some((s) => s.card_id === "card-1")).toBe(false);
    expect((await getReviewLogs(env)).some((l) => l.card_id === "card-1")).toBe(false);
    expect(await getR2(env, "materials/user-a/fig.png")).toBe("png-bytes");
  });

  it("returns 400 for an archived card and keeps its history", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCardFixture(env, { id: "card-arch", status: "archived" });
    await seedSchedule(env, {
      card_id: "card-arch",
      due: PAST_DUE,
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
    await seedReviewLog(env, {
      id: "log-arch",
      card_id: "card-arch",
      rating: 1,
      scheduled_days: 0,
      elapsed_days: 0,
      reviewed_at: PAST_DUE,
      state_json: "{}",
    });
    const res = await del(env, "card-arch");
    expect(res.status).toBe(400);
    expect((await getCards(env)).some((c) => c.id === "card-arch")).toBe(true);
    expect((await getSchedules(env)).some((s) => s.card_id === "card-arch")).toBe(true);
    expect((await getReviewLogs(env)).some((l) => l.card_id === "card-arch")).toBe(
      true,
    );
  });

  it("returns 400 for a draft", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCardFixture(env, { id: "card-draft", status: "draft" });
    const res = await del(env, "card-draft");
    expect(res.status).toBe(400);
    expect((await getCards(env)).some((c) => c.id === "card-draft")).toBe(true);
  });

  it("returns 404 for another user's card", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCardFixture(env, { id: "card-1", status: "accepted" });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    const res = await del(env, "card-1", "sess-b");
    expect(res.status).toBe(404);
    expect((await getCards(env)).some((c) => c.id === "card-1")).toBe(true);
  });
});
