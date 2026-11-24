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
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  cardFromScheduleRow,
  retrievability,
} from "../../src/study/fsrs/retrievability";
import { aggregateSubjectRecall } from "../../src/study/session/subjectRecall";

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

type SubjectBody = {
  id: string;
  title: string;
  created_at: string;
  deck_count: number;
};

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

describe("subject CRUD", () => {
  it("creates a subject and lists it with deck_count 0", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const createRes = await app.request(
      "/api/subjects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Anatomy" }),
      },
      env,
    );

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as SubjectBody;
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Anatomy");
    expect(created.created_at).toBeTruthy();
    expect(created.deck_count).toBe(0);

    const listRes = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as SubjectBody[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      title: "Anatomy",
      deck_count: 0,
    });
  });

  it("renames a subject via PATCH", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Old title",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "New title" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SubjectBody;
    expect(body).toMatchObject({
      id: "sub-1",
      title: "New title",
      deck_count: 0,
    });
  });

  it("deletes an empty subject with 204", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-empty",
      user_id: "user-a",
      title: "Empty",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-empty",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);

    const listRes = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    const list = (await listRes.json()) as SubjectBody[];
    expect(list).toHaveLength(0);
  });

  it("returns 409 when deleting a subject that still has decks", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-full",
      user_id: "user-a",
      title: "Has decks",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-full",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-full",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
    expect(res.headers.get("content-type") ?? "").toMatch(
      /application\/problem\+json/,
    );
    const body = (await res.json()) as {
      type: string;
      title: string;
      detail: string;
      status: number;
      deck_count: number;
    };
    expect(body).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/subject-has-decks",
      title: "Subject still has decks",
      detail: "Subject still has decks",
      status: 409,
      deck_count: 1,
    });
  });

  it("lists only the current user's subjects", async () => {
    const env = cfEnv;
    await seedOwner(env);
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
      title: "Mine",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as SubjectBody[];
    expect(list).toEqual([
      {
        id: "sub-a",
        title: "Mine",
        created_at: "2026-01-01T00:00:00.000Z",
        deck_count: 0,
      },
    ]);
  });
});

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

describe("GET /api/subjects/composition-summaries", () => {
  it("401 when unauthenticated", async () => {
    const env = cfEnv;
    const res = await app.request(
      "/api/subjects/composition-summaries",
      {},
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns owner summaries only with graduated pct", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-empty",
      user_id: "user-a",
      title: "Empty",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-other",
      user_id: "user-b",
      title: "Other",
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
    await seedDeck(env, {
      id: "deck-other",
      user_id: "user-b",
      title: "Stolen",
      subject_id: "sub-other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-new",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("New?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-young",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Young?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "c-young",
      due: "2026-01-02T00:00:00.000Z",
      stability: 20,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 20,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: "2026-01-01T12:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-other",
      deck_id: "deck-other",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Other?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      subjectId: string;
      total: number;
      graduatedPct: number | null;
      new: number;
      learning: number;
      young: number;
      mature: number;
      avgRetrievability: number | null;
      etk: number;
      recallCardCount: number;
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      subjectId: "sub-empty",
      total: 0,
      graduatedPct: null,
      new: 0,
      learning: 0,
      young: 0,
      mature: 0,
      avgRetrievability: null,
      etk: 0,
      recallCardCount: 0,
    });
    expect(body[1]).toMatchObject({
      subjectId: "sub-1",
      total: 2,
      graduatedPct: 50,
      new: 1,
      learning: 0,
      young: 1,
      mature: 0,
      recallCardCount: 2,
    });
    expect(body[1]!.avgRetrievability).not.toBeNull();
    expect(body[1]!.etk).toBeGreaterThan(0);
    for (const row of body) {
      expect(row).toHaveProperty("avgRetrievability");
      expect(row).toHaveProperty("etk");
      expect(row).toHaveProperty("recallCardCount");
    }
  });
});

describe("subject ownership", () => {
  it("returns 404 when PATCH targets another user's subject", async () => {
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
      "/api/subjects/sub-a",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ title: "Stolen rename" }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when DELETE targets another user's subject", async () => {
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
      "/api/subjects/sub-a",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});
