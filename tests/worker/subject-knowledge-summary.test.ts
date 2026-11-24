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
import { afterEach, describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { composeSubjectKnowledge } from "../../src/study/subjectKnowledge";
import {
  recomputeSubjectKnowledgeSummary,
  compositionJsonFromSummary,
} from "../../worker/subjects/knowledgeSummary";
import { getDb } from "../../worker/db/client";


afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = new Date("2026-11-01T12:00:00.000Z");

async function seedBase(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
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
    state: State.Review,
    last_review: "2026-01-01T12:00:00.000Z",
  });
}

describe("subject knowledge summaries", () => {
  it("recompute buckets match composeSubjectKnowledge", async () => {
    const env = cfEnv;
    await seedBase(env);
    const db = getDb(env);

    const summary = await recomputeSubjectKnowledgeSummary(
      db,
      "user-a",
      "sub-1",
      NOW,
    );
    const live = composeSubjectKnowledge(
      [
        {
          state: null,
          scheduled_days: null,
          due: null,
          stability: null,
          difficulty: null,
          elapsed_days: null,
          learning_steps: null,
          reps: null,
          lapses: null,
          last_review: null,
        },
        {
          state: State.Review,
          scheduled_days: 20,
          due: "2026-01-02T00:00:00.000Z",
          stability: 20,
          difficulty: 5,
          elapsed_days: 0,
          learning_steps: 0,
          reps: 1,
          lapses: 0,
          last_review: "2026-01-01T12:00:00.000Z",
        },
      ],
      NOW,
    );

    expect(summary.new_count).toBe(live.new);
    expect(summary.learning_count).toBe(live.learning);
    expect(summary.young_count).toBe(live.young);
    expect(summary.mature_count).toBe(live.mature);
    expect(summary.recall_card_count).toBe(live.recallCardCount);
    expect(summary.r_sum).toBeCloseTo(live.etk, 8);

    const json = compositionJsonFromSummary(summary);
    expect(json).toMatchObject({
      subjectId: "sub-1",
      total: live.total,
      graduatedPct: live.graduatedPct,
      new: live.new,
      learning: live.learning,
      young: live.young,
      mature: live.mature,
      recallCardCount: live.recallCardCount,
    });
    expect(json.avgRetrievability).toBeCloseTo(live.avgRetrievability!, 8);
    expect(json.etk).toBeCloseTo(live.etk, 8);
  });

  it("composition-summaries lazy-backfills then serves warm rows", async () => {
    const env = cfEnv;
    await seedBase(env);

    const cold = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(cold.status).toBe(200);
    const coldBody = (await cold.json()) as Array<{
      subjectId: string;
      total: number;
      new: number;
      young: number;
    }>;
    expect(coldBody).toEqual([
      expect.objectContaining({
        subjectId: "sub-1",
        total: 2,
        new: 1,
        young: 1,
      }),
    ]);

    await seedCard(env, {
      id: "c-late",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Late?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    const warm = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(warm.status).toBe(200);
    const warmBody = (await warm.json()) as Array<{ total: number }>;
    // Warm summary is stale until write-path refresh; total stays 2.
    expect(warmBody[0]!.total).toBe(2);
  });

  it("archive refreshes summary buckets", async () => {
    const env = cfEnv;
    await seedBase(env);
    const db = getDb(env);
    await recomputeSubjectKnowledgeSummary(db, "user-a", "sub-1", NOW);

    const archiveRes = await app.request(
      "/api/cards/c-new/archive",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(archiveRes.status).toBe(200);

    const res = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      total: number;
      new: number;
      young: number;
    }>;
    expect(body[0]).toMatchObject({ total: 1, new: 0, young: 1 });
  });

  it("undo-review refreshes summary after un-accept", async () => {
    const env = cfEnv;
    await seedBase(env);
    const db = getDb(env);
    await recomputeSubjectKnowledgeSummary(db, "user-a", "sub-1", NOW);

    const undoRes = await app.request(
      "/api/cards/c-young/undo-review",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(undoRes.status).toBe(200);

    const res = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      total: number;
      new: number;
      young: number;
    }>;
    expect(body[0]).toMatchObject({ total: 1, new: 1, young: 0 });
  });
});
