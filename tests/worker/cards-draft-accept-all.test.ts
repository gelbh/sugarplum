import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getSchedules,
  resetTestDb,
  seedCard,
  seedCardsReviewDraftJob,
  seedCardsReviewOwner,
  seedDeck,
  seedSchedule,
  seedSession,
  seedUser,
} from "./harness";
import { postAcceptAll, withDraftListCasFlip } from "./harness/cards";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("draft review / accept gate", () => {
  it("accept-all accepts every draft for the job and schedules them", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-bulk",
      materialId: "mat-1",
      deckId: "deck-a",
      cards: [{ id: "d1" }, { id: "d2" }],
      finishedAt: "2026-01-01T00:01:00.000Z",
    });

    const res = await postAcceptAll(env, "job-bulk");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 2,
      failed: 0,
      rejectedSiblingCount: 0,
      unlocks: [expect.objectContaining({ id: "accepts_1" })],
    });
    expect((await getCards(env)).every((c) => c.status === "accepted")).toBe(true);
    expect((await getSchedules(env))).toHaveLength(2);
  });

  it("accept-all rejects draft cards on other owned needs_review jobs", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-a",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "a1" }, { id: "a2" }],
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-b",
      materialId: "mat-b",
      deckId: "deck-a",
      cards: [{ id: "b-draft" }, { id: "b-accepted", status: "accepted" }],
    });

    const res = await postAcceptAll(env, "job-a");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 2,
      failed: 0,
      rejectedSiblingCount: 1,
      unlocks: [expect.objectContaining({ id: "accepts_1" })],
    });
    expect((await getCards(env)).find((c) => c.id === "a1")?.status).toBe("accepted");
    expect((await getCards(env)).find((c) => c.id === "a2")?.status).toBe("accepted");
    expect((await getCards(env)).find((c) => c.id === "b-draft")?.status).toBe(
      "rejected",
    );
    expect((await getCards(env)).find((c) => c.id === "b-accepted")?.status).toBe(
      "accepted",
    );
  });

  it("accept-all with failures leaves sibling drafts untouched", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-fail",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "d-cas" }, { id: "d-ok" }],
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-sib",
      materialId: "mat-b",
      deckId: "deck-a",
      cards: [{ id: "sib-draft" }],
    });
    const envWithFlip = withDraftListCasFlip(env, "d-cas");

    const res = await postAcceptAll(envWithFlip, "job-fail");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect((await getCards(env)).find((c) => c.id === "sib-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all with zero drafts does not reject siblings", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-empty",
      materialId: "mat-empty",
      deckId: "deck-a",
      cards: [],
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-sib",
      materialId: "mat-sib",
      deckId: "deck-a",
      cards: [{ id: "sib-draft" }],
    });

    const res = await postAcceptAll(env, "job-empty");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 0,
      failed: 0,
      rejectedSiblingCount: 0,
      unlocks: [],
    });
    expect((await getCards(env)).find((c) => c.id === "sib-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all does not reject another user's needs_review drafts", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Chem",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-mine",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "mine-draft" }],
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-other",
      materialId: "mat-other",
      deckId: "deck-b",
      cards: [{ id: "other-draft" }],
    });

    const res = await postAcceptAll(env, "job-mine");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 1,
      failed: 0,
      rejectedSiblingCount: 0,
      unlocks: [expect.objectContaining({ id: "accepts_1" })],
    });
    expect((await getCards(env)).find((c) => c.id === "other-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all CAS miss does not insert a schedule or 500", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-cas",
      materialId: "mat-1",
      deckId: "deck-a",
      cards: [],
    });

    await seedCard(env, {
      id: "d-cas",
      deck_id: "deck-a",
      job_id: "job-cas",
      type: "qa",
      front_json: JSON.stringify("Cas?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "c" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "d-ok",
      deck_id: "deck-a",
      job_id: "job-cas",
      type: "qa",
      front_json: JSON.stringify("Ok?"),
      back_json: JSON.stringify("B"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "o" }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    // After drafts are listed, flip d-cas so UPDATE CAS misses (concurrent accept).
    const envWithFlip = withDraftListCasFlip(env, "d-cas");

    const res = await postAcceptAll(envWithFlip, "job-cas");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect(
      (await getSchedules(env))
        .map((s) => s.card_id)
        .sort(),
    ).toEqual(["d-ok"]);
  });

  it("accept-all counts schedule races as failed without 500", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-race",
      materialId: "mat-1",
      deckId: "deck-a",
      cards: [],
    });

    await seedCard(env, {
      id: "d-race",
      deck_id: "deck-a",
      job_id: "job-race",
      type: "qa",
      front_json: JSON.stringify("Race?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "r" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    // Pre-existing schedule: CAS update may succeed, then INSERT throws (race).
    await seedSchedule(env, {
      card_id: "d-race",
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
    await seedCard(env, {
      id: "d-ok",
      deck_id: "deck-a",
      job_id: "job-race",
      type: "qa",
      front_json: JSON.stringify("Ok?"),
      back_json: JSON.stringify("B"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "o" }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    const res = await postAcceptAll(env, "job-race");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect((await getCards(env)).find((c) => c.id === "d-ok")?.status).toBe(
      "accepted",
    );
  });

  it("accept-all returns 404 for another user", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    await seedCardsReviewDraftJob(env, {
      jobId: "job-bulk",
      materialId: "mat-1",
      deckId: "deck-a",
      cards: [],
    });

    const res = await app.request(
      "/api/jobs/job-bulk/drafts/accept-all",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
  });
});
