import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const NOW = "2026-01-01T12:00:00.000Z";

describe("POST /api/study/review relearning", () => {
  it("grades a state=3 (relearning) card without 500", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-relearn",
      email: "relearn@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: NOW,
    });
    env.seedDeck({
      id: "deck-relearn",
      user_id: "user-relearn",
      title: "Relearn deck",
      subject_hint: null,
      created_at: NOW,
    });
    env.seedSession("sess-relearn", "user-relearn");
    env.seedCard({
      id: "card-relearn",
      deck_id: "deck-relearn",
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
    env.seedSchedule({
      card_id: "card-relearn",
      due: "2020-01-01T00:00:00.000Z",
      stability: 0.5,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 5,
      lapses: 1,
      state: State.Relearning,
      last_review: "2025-12-31T12:00:00.000Z",
      stability_fast: 0.4,
    });

    const res = await app.request(
      "/api/study/review",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-relearn`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ cardId: "card-relearn", rating: 3 }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { due: string; state: number };
    expect(body.due).toBeTruthy();
    expect(typeof body.state).toBe("number");
  });
});
