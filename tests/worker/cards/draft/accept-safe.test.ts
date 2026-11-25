import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getSchedules,
  resetTestDb,
  seedCard,
  seedCardsReviewDraftJob,
  seedCardsReviewOwner,
} from "../../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("draft review / accept gate", () => {
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
});
