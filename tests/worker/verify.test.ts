import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { Rating, newCard, review } from "../../worker/study/fsrs";
import { createTestEnv } from "./test-env";

/**
 * P0–P1 Spec Verify acceptance checks.
 * SPA deep-link `/study` → 200 HTML is manual (README deploy section).
 * Study/Draft UI is MUI-only (no layout .css beyond theme) — confirmed in repo layout.
 */
describe("spec verify: auth scoping", () => {
  it("unauthenticated cannot list another user’s decks", async () => {
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
      title: "Private deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request("/api/decks", {}, env);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain("Private deck");
    expect(text).not.toContain("deck-a");
  });
});

describe("spec verify: draft gate", () => {
  it("draft never appears in /api/study/due", async () => {
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
      title: "Bio",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedCard({
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
    // Even with a schedule row (should not happen for drafts), due must skip drafts.
    env.seedSchedule({
      card_id: "card-draft",
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
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { id: string }[] };
    expect(body.cards.some((c) => c.id === "card-draft")).toBe(false);
  });
});

describe("spec verify: fsrs", () => {
  it("good rating advances due", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const after = review(newCard(now), Rating.Good, now);
    expect(after.due.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("spec verify: LLM settings", () => {
  it("GET LLM settings has no raw key", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const apiKey = "sk-live-verify-never-leak-this";

    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ provider: "openai", apiKey }),
      },
      env,
    );
    expect(putRes.status).toBe(200);

    const getRes = await app.request(
      "/api/settings/llm",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("ciphertext");
    expect(body.configured).toBe(true);
  });
});
