import { describe, it, expect, vi, afterEach } from "vitest";
import { Rating } from "ts-fsrs";
import { FSRS7_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-7";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";
import { getDb } from "../../worker/db/client";
import * as fsrsReschedule from "../../worker/study/fsrsReschedule";
import {
  replayCardFromLogs,
  type ReviewLogReplayRow,
} from "../../worker/study/fsrsReschedule";
import {
  FsrsRescheduleError,
  resetFsrsWeights,
  saveFsrsWeights,
} from "../../worker/study/fsrsOptimize";
import { applyDeferrals } from "../../worker/study/dueQueue";
import { emptyFsrsCard } from "../../src/study/retrievability";
import { schedulerForPrefs } from "../../src/study/fsrs/fsrsFactory";

const customW = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));

const sampleLogs: ReviewLogReplayRow[] = [
  { reviewed_at: "2026-01-01T12:00:00.000Z", rating: 3 },
  { reviewed_at: "2026-01-03T12:00:00.000Z", rating: 3 },
  { reviewed_at: "2026-01-10T12:00:00.000Z", rating: 4 },
];

describe("replayCardFromLogs", () => {
  it("yields different due/stability for custom w vs default", async () => {
    const withDefault = await replayCardFromLogs(sampleLogs, {
      desiredRetention: 0.9,
      enableFuzz: true,
    });
    const withCustom = await replayCardFromLogs(sampleLogs, {
      desiredRetention: 0.9,
      enableFuzz: true,
      w: customW,
    });
    expect(withDefault).not.toBeNull();
    expect(withCustom).not.toBeNull();
    expect(withCustom!.dueAt.getTime()).not.toBe(withDefault!.dueAt.getTime());
  });

  it("is deterministic with fuzz forced off", async () => {
    const a = await replayCardFromLogs(sampleLogs, {
      desiredRetention: 0.9,
      enableFuzz: false,
      w: customW,
    });
    const b = await replayCardFromLogs(sampleLogs, {
      desiredRetention: 0.9,
      enableFuzz: false,
      w: customW,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.dueAt.toISOString()).toBe(b!.dueAt.toISOString());
    expect(a!.stability).toBe(b!.stability);
  });

  it("returns null for empty or all-invalid logs", async () => {
    expect(
      await replayCardFromLogs([], { desiredRetention: 0.9, enableFuzz: false }),
    ).toBeNull();
    expect(
      await replayCardFromLogs(
        [
          { reviewed_at: "nope", rating: 3 },
          { reviewed_at: "2026-01-01T00:00:00.000Z", rating: 9 },
        ],
        { desiredRetention: 0.9, enableFuzz: false },
      ),
    ).toBeNull();
  });

  it("accept-time empty seed matches first-log seed after first grade", async () => {
    const acceptAt = new Date("2026-01-01T10:00:00.000Z");
    const firstAt = new Date("2026-01-03T12:00:00.000Z");
    const scheduler = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      const fromAccept = scheduler.review({
        card: emptyFsrsCard(acceptAt, "seed"),
        grade,
        now: firstAt,
      }).card;
      const fromFirst = scheduler.review({
        card: emptyFsrsCard(firstAt, "seed"),
        grade,
        now: firstAt,
      }).card;
      expect(fromAccept.dueAt.toISOString()).toBe(fromFirst.dueAt.toISOString());
      expect(fromAccept.stability).toBe(fromFirst.stability);
      expect(fromAccept.difficulty).toBe(fromFirst.difficulty);
      expect(fromAccept.state).toBe(fromFirst.state);
    }
  });
});

describe("reschedule on weight save/reset", () => {
  function seedBase(env: ReturnType<typeof createTestEnv>) {
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-b",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-a",
      due: "2026-02-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: "2026-01-10T12:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-b",
      due: "2026-02-15T00:00:00.000Z",
      stability: 2,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
    for (const [i, log] of sampleLogs.entries()) {
      env.seedReviewLog({
        id: `rl-a-${i}`,
        card_id: "card-a",
        rating: log.rating,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: log.reviewed_at,
        state_json: JSON.stringify({ state: 1 }),
      });
    }
  }

  it("saveFsrsWeights rewrites schedules for cards with logs", async () => {
    const env = createTestEnv();
    seedBase(env);
    const before = env.getSchedules().find((s) => s.card_id === "card-a")!;
    const db = getDb(env);
    const result = await saveFsrsWeights(db, "user-a", customW);
    expect(result.w).toHaveLength(34);
    expect(result.rescheduled.cardsUpdated).toBe(1);
    const after = env.getSchedules().find((s) => s.card_id === "card-a")!;
    expect(after.due).not.toBe(before.due);
    const untouched = env.getSchedules().find((s) => s.card_id === "card-b")!;
    expect(untouched.due).toBe("2026-02-15T00:00:00.000Z");
    expect(untouched.stability).toBe(2);
  });

  it("resetFsrsWeights reschedules under library defaults", async () => {
    const env = createTestEnv();
    seedBase(env);
    const db = getDb(env);
    await saveFsrsWeights(db, "user-a", customW);
    const afterCustom = env.getSchedules().find((s) => s.card_id === "card-a")!;
    const reset = await resetFsrsWeights(db, "user-a");
    expect(reset.rescheduled.cardsUpdated).toBe(1);
    const afterReset = env.getSchedules().find((s) => s.card_id === "card-a")!;
    expect(afterReset.due).not.toBe(afterCustom.due);
  });

  it("saveFsrsWeights does not rewrite another user's schedules", async () => {
    const env = createTestEnv();
    seedBase(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-b-owned",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-b-owned",
      due: "2026-03-01T00:00:00.000Z",
      stability: 9,
      difficulty: 4,
      elapsed_days: 0,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2026-01-05T00:00:00.000Z",
    });
    env.seedReviewLog({
      id: "rl-b-1",
      card_id: "card-b-owned",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-01-05T00:00:00.000Z",
      state_json: JSON.stringify({ state: 1 }),
    });
    const beforeB = {
      ...env.getSchedules().find((s) => s.card_id === "card-b-owned")!,
    };

    await saveFsrsWeights(getDb(env), "user-a", customW);

    const afterB = env.getSchedules().find((s) => s.card_id === "card-b-owned")!;
    expect(afterB).toEqual(beforeB);
  });

  it("budget PUT does not change schedules or fsrs_w_json", async () => {
    const env = createTestEnv();
    seedBase(env);
    env.seedUserStudyPrefs({
      user_id: "user-a",
      intro_budget: 20,
      review_budget: 200,
      r_floor: 0.8,
      desired_retention: 0.9,
      enable_fuzz: 1,
      fsrs_w_json: JSON.stringify(customW),
      fsrs_last_optimized_at: "2026-01-01T00:00:00.000Z",
      fsrs_optimize_pending: 0,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const before = env.getSchedules().find((s) => s.card_id === "card-a")!;

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          introBudget: 15,
          reviewBudget: 150,
          rFloor: 0.8,
          desiredRetention: 0.9,
          enableFuzz: true,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);

    const after = env.getSchedules().find((s) => s.card_id === "card-a")!;
    expect(after).toEqual(before);
    const prefs = env.getUserStudyPrefs().find((p) => p.user_id === "user-a")!;
    expect(prefs.fsrs_w_json).toBe(JSON.stringify(customW));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps prefs and throws FsrsRescheduleError when reschedule fails", async () => {
    const env = createTestEnv();
    seedBase(env);
    vi.spyOn(fsrsReschedule, "rescheduleUserSchedules").mockRejectedValue(
      new Error("d1 boom"),
    );

    await expect(
      saveFsrsWeights(getDb(env), "user-a", customW),
    ).rejects.toBeInstanceOf(FsrsRescheduleError);

    const prefs = env.getUserStudyPrefs().find((p) => p.user_id === "user-a")!;
    expect(prefs.fsrs_w_json).toBe(JSON.stringify(customW));
  });

  it("PUT weights maps reschedule failure to 500 not Invalid FSRS weights", async () => {
    const env = createTestEnv();
    seedBase(env);
    vi.spyOn(fsrsReschedule, "rescheduleUserSchedules").mockRejectedValue(
      new Error("d1 boom"),
    );

    const res = await app.request(
      "/api/settings/study/fsrs-weights",
      {
        method: "PUT",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ w: customW }),
      },
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain(
      "Weights saved; schedule reschedule failed",
    );
    expect(JSON.stringify(body)).not.toContain("Invalid FSRS weights");
  });

  it("applyDeferrals does not rewrite another user's due", async () => {
    const env = createTestEnv();
    seedBase(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-b-owned",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-b-owned",
      due: "2026-03-01T00:00:00.000Z",
      stability: 9,
      difficulty: 4,
      elapsed_days: 0,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2026-01-05T00:00:00.000Z",
    });

    await applyDeferrals(getDb(env), "user-a", [
      { id: "card-b-owned", newDue: "2099-01-01T00:00:00.000Z" },
    ]);

    const after = env.getSchedules().find((s) => s.card_id === "card-b-owned")!;
    expect(after.due).toBe("2026-03-01T00:00:00.000Z");
  });
});
