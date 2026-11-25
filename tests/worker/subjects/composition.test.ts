import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import {
  cardFromScheduleRow,
  retrievability,
} from "../../../src/study/fsrs/retrievability";
import { aggregateSubjectRecall } from "../../../src/study/queue/subjectRecall";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const COMPOSITION_NOW = new Date("2026-11-01T12:00:00.000Z");

function compositionSchedule(
  state: number,
  scheduled_days: number,
): Parameters<typeof cardFromScheduleRow>[0] {
  return {
    due: "2026-01-02T00:00:00.000Z",
    stability: Math.max(scheduled_days, 0.1),
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state,
    last_review: "2026-01-01T12:00:00.000Z",
  };
}

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("GET /api/subjects/:id/composition", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(COMPOSITION_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function seedAccepted(
    env: Bindings,
    id: string,
    schedule?: { state: number; scheduled_days: number },
  ) {
    await seedCard(env, {
      id,
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify(`${id}?`),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    if (schedule) {
      await seedSchedule(env, {
        card_id: id,
        ...compositionSchedule(schedule.state, schedule.scheduled_days),
      });
    }
  }

  it("401 when unauthenticated", async () => {
    const env = cfEnv;
    const res = await app.request("/api/subjects/sub-1/composition", {}, env);
    expect(res.status).toBe(401);
  });

  it("404 for missing subject", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const res = await app.request(
      "/api/subjects/missing/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("404 when another user owns the subject", async () => {
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
    await seedSubject(env, {
      id: "sub-a",
      user_id: "user-a",
      title: "Owner subject",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/subjects/sub-a/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("aggregates accepted schedules across subject decks", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_id: "sub-1",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedAccepted(env, "c-new");
    await seedAccepted(env, "c-learn", { state: 1, scheduled_days: 0 });
    await seedAccepted(env, "c-young", { state: 2, scheduled_days: 20 });
    await seedAccepted(env, "c-mature", { state: 2, scheduled_days: 21 });
    await seedCard(env, {
      id: "c-draft",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-1/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const recall = aggregateSubjectRecall([
      null,
      retrievability(
        cardFromScheduleRow(compositionSchedule(1, 0)),
        COMPOSITION_NOW,
      ),
      retrievability(
        cardFromScheduleRow(compositionSchedule(2, 20)),
        COMPOSITION_NOW,
      ),
      retrievability(
        cardFromScheduleRow(compositionSchedule(2, 21)),
        COMPOSITION_NOW,
      ),
    ]);
    expect(await res.json()).toEqual({
      new: 1,
      learning: 1,
      young: 1,
      mature: 1,
      total: 4,
      graduated: 2,
      graduatedPct: 50,
      avgRetrievability: recall.avgRetrievability,
      etk: recall.etk,
      recallCardCount: recall.recallCardCount,
    });
  });

  it("all New / no last_review → avg 0 and 0 etk", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_id: "sub-1",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedAccepted(env, "c-new-a");
    await seedAccepted(env, "c-new-b");

    const res = await app.request(
      "/api/subjects/sub-1/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      new: 2,
      learning: 0,
      young: 0,
      mature: 0,
      total: 2,
      graduated: 0,
      graduatedPct: 0,
      avgRetrievability: 0,
      etk: 0,
      recallCardCount: 2,
    });
  });
});
