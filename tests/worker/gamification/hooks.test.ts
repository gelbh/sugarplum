import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSchedule,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = "2026-01-01T12:00:00.000Z";

async function seedAuthedUser(env: Bindings) {
  await seedUser(env, {
    id: "user-hooks",
    email: "hooks@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  await seedDeck(env, {
    id: "deck-hooks",
    user_id: "user-hooks",
    title: "Hooks deck",
    subject_hint: null,
    created_at: NOW,
  });
  await seedSession(env, "sess-hooks", "user-hooks");
}

const authedHeaders = {
  cookie: `${SESSION_COOKIE}=sess-hooks`,
  "content-type": "application/json",
};

describe("gamification route hooks", () => {
  it("POST /api/study/review unlocks reviews_1 on first review", async () => {
    const env = cfEnv;
    await seedAuthedUser(env);
    await seedCard(env, {
      id: "card-review",
      deck_id: "deck-hooks",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });
    await seedSchedule(env, {
      card_id: "card-review",
      due: "2020-01-01T00:00:00.000Z",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    const res = await app.request(
      "/api/study/review",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ cardId: "card-review", rating: 3 }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      due: string;
      unlocks: { id: string }[];
    };
    expect(body.due).toBeTruthy();
    expect(typeof body.state).toBe("number");
    expect(body.unlocks.map((u) => u.id)).toContain("reviews_1");
  });

  it("POST /api/cards/:id/accept unlocks accepts_1 on first accept", async () => {
    const env = cfEnv;
    await seedAuthedUser(env);
    await seedMaterial(env, {
      id: "mat-hooks",
      deck_id: "deck-hooks",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: NOW,
    });
    await seedGenerationJob(env, {
      id: "job-hooks",
      material_id: "mat-hooks",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: NOW,
      finished_at: null,
    });
    await seedCard(env, {
      id: "card-accept",
      deck_id: "deck-hooks",
      job_id: "job-hooks",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
    });

    const res = await app.request(
      "/api/cards/card-accept/accept",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-hooks` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      unlocks: { id: string }[];
    };
    expect(body.status).toBe("accepted");
    expect(body.unlocks.map((u) => u.id)).toContain("accepts_1");
  });
});
