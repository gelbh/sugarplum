import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getSchedules,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type CardBody = {
  id: string;
  deck_id: string;
  type: string;
  front: string | Record<string, unknown>;
  back: string | { answer: string };
  status: string;
  options?: string[];
  media_r2_keys?: string[];
};

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...extra,
  };
}

describe("PATCH /api/cards/:id (accepted hub edit)", () => {
  it("patches front on an accepted card without changing schedule", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCard(env, {
      id: "card-acc",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Old Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "card-acc",
      due: "2030-01-01T00:00:00.000Z",
      stability: 40,
      difficulty: 7,
      elapsed_days: 10,
      scheduled_days: 30,
      learning_steps: 2,
      reps: 8,
      lapses: 3,
      state: 2,
      last_review: "2026-06-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-acc",
      {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ front: "New Q?" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      id: "card-acc",
      status: "accepted",
      front: "New Q?",
      back: "A",
    });

    const schedule = (await getSchedules(env)).find((s) => s.card_id === "card-acc");
    expect(schedule?.due).toBe("2030-01-01T00:00:00.000Z");
    expect(schedule?.reps).toBe(8);
    expect(schedule?.lapses).toBe(3);
  });
});
