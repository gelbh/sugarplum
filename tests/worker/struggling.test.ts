import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  rankStruggling,
  type StrugglingCandidate,
} from "../../worker/study/struggling";
import { createTestEnv } from "./test-env";

const NOW = "2026-10-27T12:00:00.000Z";

function candidate(
  overrides: Partial<StrugglingCandidate> & Pick<StrugglingCandidate, "id">,
): StrugglingCandidate {
  return {
    deck_id: "deck-a",
    front_json: JSON.stringify("Q?"),
    lapses: 0,
    again_14d: 0,
    difficulty: 5,
    due: "2026-11-01T00:00:00.000Z",
    last_review: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("rankStruggling", () => {
  it("includes when lapses >= 2", () => {
    const rows = rankStruggling(
      [candidate({ id: "lapse-heavy", lapses: 2, again_14d: 0 })],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("lapse-heavy");
  });

  it("includes when again_14d >= 2 even if lapses 0", () => {
    const rows = rankStruggling(
      [candidate({ id: "again-heavy", lapses: 0, again_14d: 2 })],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("again-heavy");
  });

  it("excludes when neither threshold met", () => {
    const rows = rankStruggling(
      [candidate({ id: "ok", lapses: 1, again_14d: 1 })],
      NOW,
    );
    expect(rows).toHaveLength(0);
  });

  it("ranks by again_14d desc then difficulty desc then last_review asc", () => {
    const rows = rankStruggling(
      [
        candidate({
          id: "low-again-hard",
          again_14d: 2,
          difficulty: 9,
          last_review: "2026-10-10T00:00:00.000Z",
        }),
        candidate({
          id: "high-again",
          again_14d: 5,
          difficulty: 1,
          last_review: "2026-10-25T00:00:00.000Z",
        }),
        candidate({
          id: "low-again-easy-early",
          again_14d: 2,
          difficulty: 3,
          last_review: "2026-10-01T00:00:00.000Z",
        }),
        candidate({
          id: "low-again-easy-late",
          again_14d: 2,
          difficulty: 3,
          last_review: "2026-10-15T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "high-again",
      "low-again-hard",
      "low-again-easy-early",
      "low-again-easy-late",
    ]);
  });

  it("caps at 50 by default", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      candidate({
        id: `c-${i}`,
        lapses: 2,
        again_14d: 60 - i,
        difficulty: i,
      }),
    );
    expect(rankStruggling(many, NOW)).toHaveLength(50);
    expect(rankStruggling(many, NOW, 3)).toHaveLength(3);
  });

  it("sets is_due when due <= now", () => {
    const rows = rankStruggling(
      [
        candidate({
          id: "due-now",
          lapses: 2,
          due: "2026-10-27T12:00:00.000Z",
        }),
        candidate({
          id: "future",
          lapses: 2,
          due: "2026-10-27T12:00:00.001Z",
        }),
      ],
      NOW,
    );
    expect(rows.find((r) => r.id === "due-now")!.is_due).toBe(true);
    expect(rows.find((r) => r.id === "future")!.is_due).toBe(false);
  });

  it("maps front_json string or prompt/text to preview", () => {
    const rows = rankStruggling(
      [
        candidate({
          id: "str",
          lapses: 2,
          front_json: JSON.stringify("A".repeat(130)),
        }),
        candidate({
          id: "prompt",
          lapses: 2,
          front_json: JSON.stringify({ prompt: "Identify X" }),
        }),
      ],
      NOW,
    );
    expect(rows.find((r) => r.id === "str")!.front_preview).toHaveLength(120);
    expect(rows.find((r) => r.id === "prompt")!.front_preview).toBe(
      "Identify X",
    );
  });
});

describe("GET /api/study/struggling", () => {
  it("returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/study/struggling", {}, env);
    expect(res.status).toBe(401);
  });

  it("never returns another user’s cards", async () => {
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Theirs",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

    env.seedCard({
      id: "mine",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Mine?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "mine",
      due: "2026-10-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 3,
      lapses: 2,
      state: 2,
      last_review: "2026-10-20T00:00:00.000Z",
    });

    env.seedCard({
      id: "theirs",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Secret?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "theirs",
      due: "2026-10-01T00:00:00.000Z",
      stability: 1,
      difficulty: 9,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 3,
      lapses: 5,
      state: 2,
      last_review: "2026-10-20T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((r) => r.id)).toEqual(["mine"]);
    expect(body.some((r) => r.id === "theirs")).toBe(false);
  });

  it("includes cards via again_14d from review_logs SQL", async () => {
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedReviewLog({
      id: "rl-1",
      card_id: "again-card",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-10-25T00:00:00.000Z",
      state_json: "{}",
    });
    env.seedReviewLog({
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

  it("includes a card after a single Again (weakness > 0)", async () => {
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
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedReviewLog({
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
});
