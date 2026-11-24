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

  it("accept-safe accepts only quality survivors and leaves junk as draft", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-safe",
      materialId: "mat-safe",
      deckId: "deck-a",
      cards: [],
      finishedAt: "2026-01-01T00:01:00.000Z",
    });

    await seedCard(env, {
      id: "safe-1",
      deck_id: "deck-a",
      job_id: "job-safe",
      type: "qa",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify("Adenosine triphosphate"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "junk-1",
      deck_id: "deck-a",
      job_id: "job-safe",
      type: "qa",
      front_json: JSON.stringify("Phylum"),
      back_json: JSON.stringify("Hosts Family"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "table" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-safe/drafts/accept-safe",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      leftUnsafe: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.leftUnsafe).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    const byId = Object.fromEntries(
      (await getCards(env)).map((c) => [c.id, c.status]),
    );
    expect(byId["safe-1"]).toBe("accepted");
    expect(byId["junk-1"]).toBe("draft");
    expect((await getSchedules(env))).toHaveLength(1);
  });

  it("accept-safe does not reject drafts on other owned needs_review jobs", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCardsReviewDraftJob(env, {
      jobId: "job-safe-a",
      materialId: "mat-safe-a",
      deckId: "deck-a",
      cards: [],
    });
    await seedCardsReviewDraftJob(env, {
      jobId: "job-safe-b",
      materialId: "mat-safe-b",
      deckId: "deck-a",
      cards: [],
    });
    await seedCard(env, {
      id: "a-safe",
      deck_id: "deck-a",
      job_id: "job-safe-a",
      type: "qa",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify("Adenosine triphosphate"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "b-safe",
      deck_id: "deck-a",
      job_id: "job-safe-b",
      type: "qa",
      front_json: JSON.stringify("What is DNA?"),
      back_json: JSON.stringify("Deoxyribonucleic acid"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "DNA" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "b-junk",
      deck_id: "deck-a",
      job_id: "job-safe-b",
      type: "qa",
      front_json: JSON.stringify("Phylum"),
      back_json: JSON.stringify("Hosts Family"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "table" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-safe-a/drafts/accept-safe",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    const byId = Object.fromEntries(
      (await getCards(env)).map((c) => [c.id, c.status]),
    );
    expect(byId["a-safe"]).toBe("accepted");
    expect(byId["b-safe"]).toBe("draft");
    expect(byId["b-junk"]).toBe("draft");
  });

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
