import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const NOW = "2026-01-01T12:00:00.000Z";

describe("POST /api/study/review pre-grade scheduled_days", () => {
  it("writes pre-review interval into review_logs.scheduled_days", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-pregrade",
      email: "pregrade@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: NOW,
    });
    env.seedDeck({
      id: "deck-pregrade",
      user_id: "user-pregrade",
      title: "Pregrade deck",
      subject_hint: null,
      created_at: NOW,
    });
    env.seedSession("sess-pregrade", "user-pregrade");
    env.seedCard({
      id: "card-pregrade",
      deck_id: "deck-pregrade",
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
    const preInterval = 30;
    env.seedSchedule({
      card_id: "card-pregrade",
      due: "2020-01-01T00:00:00.000Z",
      stability: 40,
      difficulty: 5,
      elapsed_days: 30,
      scheduled_days: preInterval,
      learning_steps: 0,
      reps: 8,
      lapses: 0,
      state: State.Review,
      last_review: "2025-12-01T12:00:00.000Z",
      stability_fast: 35,
    });

    const res = await app.request(
      "/api/study/review",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-pregrade`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ cardId: "card-pregrade", rating: 3 }),
      },
      env,
    );
    expect(res.status).toBe(200);

    const logs = env.getReviewLogs().filter((l) => l.card_id === "card-pregrade");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.scheduled_days).toBe(preInterval);

    const schedule = env
      .getSchedules()
      .find((s) => s.card_id === "card-pregrade");
    expect(schedule?.scheduled_days).not.toBe(preInterval);

    const stateJson = JSON.parse(logs[0]!.state_json) as {
      scheduled_days?: number;
    };
    // state_json keeps native ts-fsrs interval (may equal pre-grade by chance).
    expect(stateJson.scheduled_days).toEqual(expect.any(Number));
  });
});
