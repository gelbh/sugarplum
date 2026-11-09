import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const PAST_DUE = "2020-01-01T00:00:00.000Z";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function seedAcceptedDue(
  env: ReturnType<typeof createTestEnv>,
  cardId: string,
  deckId: string,
) {
  env.seedCard({
    id: cardId,
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front_json: JSON.stringify(`${cardId}?`),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSchedule({
    card_id: cardId,
    due: PAST_DUE,
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
}

/** Two decks under one subject, each with a due accepted card. */
function seedScopedFixture(env: ReturnType<typeof createTestEnv>) {
  seedOwner(env);
  env.seedSubject({
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-1",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-2",
    user_id: "user-a",
    title: "Muscles",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-02T00:00:00.000Z",
  });
  seedAcceptedDue(env, "card-1", "deck-1");
  seedAcceptedDue(env, "card-2", "deck-2");
}

type DueBody = {
  cards: { id: string; deck_id?: string }[];
  meta: {
    introUsed: number;
    introBudget: number;
    heldIntroCount: number;
    reviewUsed: number;
    reviewBudget: number;
    deferredCount: number;
  };
};

describe("GET /api/study/due filter", () => {
  it("filters to one deck when deckId is set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=deck-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody;
    expect(body.cards.map((c) => c.id).sort()).toEqual(["card-1"]);
    expect(body.cards[0]!.deck_id).toBe("deck-1");
  });

  it("returns all due cards in a subject when subjectId is set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedSubject({
      id: "sub-other",
      user_id: "user-a",
      title: "Other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-other",
      user_id: "user-a",
      title: "Other deck",
      subject_hint: null,
      subject_id: "sub-other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-other", "deck-other");

    const res = await app.request(
      "/api/study/due?subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody;
    expect(body.cards.map((c) => c.id).sort()).toEqual(["card-1", "card-2"]);
  });

  it("returns 400 when both deckId and subjectId are set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=deck-1&subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for missing deckId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=missing-deck",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's deckId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Private",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-b", "deck-b");

    const res = await app.request(
      "/api/study/due?deckId=deck-b",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's subjectId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/study/due?subjectId=sub-b",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("omits both params and keeps global due behavior", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedSubject({
      id: "sub-2",
      user_id: "user-a",
      title: "Other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-3",
      user_id: "user-a",
      title: "Other deck",
      subject_hint: null,
      subject_id: "sub-2",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-3", "deck-3");

    const res = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody;
    expect(body.cards.map((c) => c.id).sort()).toEqual([
      "card-1",
      "card-2",
      "card-3",
    ]);
  });

  it("caps new cards at intro budget and reports heldIntroCount", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-many",
      user_id: "user-a",
      title: "Many",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    for (let i = 0; i < 50; i++) {
      seedAcceptedDue(env, `new-${String(i).padStart(2, "0")}`, "deck-many");
    }

    const res = await app.request(
      "/api/study/due?localDay=2026-10-28",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody;
    expect(body.cards).toHaveLength(20);
    expect(body.meta.introBudget).toBe(20);
    expect(body.meta.introUsed).toBe(20);
    expect(body.meta.heldIntroCount).toBe(30);
  });

  it("raises intro slice with introBonus for Study more", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-many",
      user_id: "user-a",
      title: "Many",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    for (let i = 0; i < 50; i++) {
      seedAcceptedDue(env, `new-${String(i).padStart(2, "0")}`, "deck-many");
    }

    const res = await app.request(
      "/api/study/due?localDay=2026-10-28&introBonus=1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody;
    expect(body.cards).toHaveLength(40);
    expect(body.meta.introUsed).toBe(40);
    expect(body.meta.heldIntroCount).toBe(10);
  });

  it("GET /due does not mutate schedule dues (pendingDeferrals only)", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-rev",
      user_id: "user-a",
      title: "Reviews",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUserStudyPrefs({
      user_id: "user-a",
      intro_budget: 20,
      review_budget: 2,
      r_floor: 0.5,
      desired_retention: 0.9,
      enable_fuzz: 1,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const dueNow = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      const id = `rev-${i}`;
      env.seedCard({
        id,
        deck_id: "deck-rev",
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`${id}?`),
        back_json: JSON.stringify("A"),
        media_r2_keys_json: null,
        provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
        status: "accepted",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      env.seedSchedule({
        card_id: id,
        due: dueNow,
        stability: 100,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 10,
        learning_steps: 0,
        reps: 5,
        lapses: 0,
        state: 2,
        last_review: "2026-10-27T12:00:00.000Z",
      });
    }

    const duesBefore = env
      .getSchedules()
      .filter((s) => s.card_id.startsWith("rev-"))
      .map((s) => [s.card_id, s.due] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const res = await app.request(
      "/api/study/due?localDay=2026-10-28",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DueBody & {
      pendingDeferrals: { id: string; newDue: string }[];
    };
    expect(body.pendingDeferrals.length).toBeGreaterThan(0);

    const duesAfter = env
      .getSchedules()
      .filter((s) => s.card_id.startsWith("rev-"))
      .map((s) => [s.card_id, s.due] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    expect(duesAfter).toEqual(duesBefore);

    const commit = await app.request(
      "/api/study/commit-pacing?localDay=2026-10-28",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(commit.status).toBe(200);
    const committed = (await commit.json()) as { deferredCount: number };
    expect(committed.deferredCount).toBeGreaterThan(0);
    const duesCommitted = env
      .getSchedules()
      .filter((s) => s.card_id.startsWith("rev-"))
      .map((s) => s.due);
    expect(duesCommitted.some((d) => d !== dueNow)).toBe(true);
  });
});
