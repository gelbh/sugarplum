import { env as cfEnv } from "cloudflare:workers";
import {
  seedGenerationJob,
  seedMaterial,
  resetTestDb,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSchedule,
  seedSession,
  seedUser,
} from "../harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("GET /api/study/struggling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes cards via again_14d from review_logs SQL", async () => {
    const env = cfEnv;
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "again-card",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Hard?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "again-card",
      due: "2026-11-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      last_review: "2026-10-20T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "easy-card",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Easy?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    // Never-reviewed: R unavailable → weakness 0 so it stays off the list.
    await seedSchedule(env, {
      card_id: "easy-card",
      due: "2026-11-01T00:00:00.000Z",
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
    await seedReviewLog(env, {
      id: "rl-1",
      card_id: "again-card",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-10-25T00:00:00.000Z",
      state_json: "{}",
    });
    await seedReviewLog(env, {
      id: "rl-2",
      card_id: "again-card",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-10-26T00:00:00.000Z",
      state_json: "{}",
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      again_14d: number;
      hard_14d: number;
    }[];
    expect(body.map((r) => r.id)).toEqual(["again-card"]);
    expect(body[0]!.again_14d).toBe(2);
    expect(body[0]!.hard_14d).toBe(0);
  });

  it("excludes never-reviewed zero-bad cards even with seeded stability", async () => {
    const env = cfEnv;
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "fresh",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Fresh?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "fresh",
      due: "2026-11-01T00:00:00.000Z",
      stability: 50,
      difficulty: 9,
      elapsed_days: 0,
      scheduled_days: 10,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body).toEqual([]);
  });

  it("includes a card after a single Again (weakness > 0)", async () => {
    const env = cfEnv;
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "once-again",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Once?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "once-again",
      due: "2026-11-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: "2026-10-26T00:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "rl-once",
      card_id: "once-again",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-10-26T00:00:00.000Z",
      state_json: "{}",
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      again_14d: number;
      hard_14d: number;
      retrievability: number | null;
    }[];
    expect(body.map((r) => r.id)).toEqual(["once-again"]);
    expect(body[0]!.again_14d).toBe(1);
    expect(body[0]!.hard_14d).toBe(0);
    expect(body[0]!).toHaveProperty("retrievability");
  });

  it("includes card type on each struggling row", async () => {
    const env = cfEnv;
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "typed-again",
      deck_id: "deck-a",
      job_id: null,
      type: "cloze",
      front_json: JSON.stringify("Typed {{c1::blank}}."),
      back_json: JSON.stringify("blank"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "typed-again",
      due: "2026-11-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: "2026-10-26T00:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "rl-typed",
      card_id: "typed-again",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-10-26T00:00:00.000Z",
      state_json: "{}",
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; type: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "typed-again", type: "cloze" });
  });

  it("flags rows by regen source (job, excerpt, none)", async () => {
    const env = cfEnv;
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-1",
      material_id: "mat-a",
      status: "done",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
    });
    await seedSession(env, "sess-a", "user-a");
    for (const [id, job_id, provenance_json] of [
      ["with-src", null, JSON.stringify({ pages: [1], excerpt: "ex" })],
      ["job-src", "job-1", null],
      ["no-src", null, null],
    ] as const) {
      await seedCard(env, {
        id,
        deck_id: "deck-a",
        job_id,
        type: "qa",
        front_json: JSON.stringify(`${id}?`),
        back_json: JSON.stringify("A"),
        media_r2_keys_json: null,
        provenance_json,
        status: "accepted",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      await seedSchedule(env, {
        card_id: id,
        due: "2026-11-01T00:00:00.000Z",
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 2,
        last_review: "2026-10-26T00:00:00.000Z",
      });
      await seedReviewLog(env, {
        id: `rl-${id}`,
        card_id: id,
        rating: 1,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: "2026-10-26T00:00:00.000Z",
        state_json: "{}",
      });
    }

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      has_regen_source: boolean;
    }[];
    expect(body.find((r) => r.id === "with-src")?.has_regen_source).toBe(true);
    expect(body.find((r) => r.id === "job-src")?.has_regen_source).toBe(true);
    expect(body.find((r) => r.id === "no-src")?.has_regen_source).toBe(false);
  });
});
