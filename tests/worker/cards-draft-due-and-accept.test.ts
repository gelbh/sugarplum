import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getSchedules,
  resetTestDb,
  seedCard,
  seedCardsReviewOwner,
  seedSchedule,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("draft review / accept gate", () => {
  it("due query skips drafts", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);

    const pastDue = "2020-01-01T00:00:00.000Z";
    await seedCard(env, {
      id: "card-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft Q?"),
      back_json: JSON.stringify("Draft A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-accepted",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Accepted Q?"),
      back_json: JSON.stringify("Accepted A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "card-accepted",
      due: pastDue,
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
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { id: string }[] };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]!.id).toBe("card-accepted");
  });

  it("accept creates schedule and leaves drafts out of due", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-draft",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const acceptRes = await app.request(
      "/api/cards/card-draft/accept",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(acceptRes.status).toBe(200);

    const card = (await getCards(env)).find((c) => c.id === "card-draft");
    expect(card?.status).toBe("accepted");
    const schedules = (await getSchedules(env));
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.card_id).toBe("card-draft");
    expect(schedules[0]!.due).toBeTruthy();

    const dueRes = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(dueRes.status).toBe(200);
    const due = (await dueRes.json()) as { cards: { id: string }[] };
    expect(due.cards.some((c) => c.id === "card-draft")).toBe(true);

    const undoRes = await app.request(
      "/api/cards/card-draft/undo-review",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(undoRes.status).toBe(200);
    expect((await getCards(env)).find((c) => c.id === "card-draft")?.status).toBe(
      "draft",
    );
    expect((await getSchedules(env)).some((s) => s.card_id === "card-draft")).toBe(
      false,
    );
  });
});
