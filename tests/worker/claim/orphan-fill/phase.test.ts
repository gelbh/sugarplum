import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getStudyClaims,
  resetTestDb,
  seedCard,
  seedClaimsNeedsReviewOwner,
  seedClaimsOrphan,
  seedGenerationJob,
} from "../../harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_ORPHAN_FILL_CAP,
  runClaimOrphanFillPhase,
} from "../../../../worker/generation/claim-orphan-fill";
import { FREE_GEN_DAILY_CAP, consumeFreeGenSlot } from "../../../../worker/generation/quota";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../../../worker/generation/claim-card-fallback";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

function qaJson(front: string, back: string, excerpt: string) {
  return JSON.stringify({
    cards: [
      {
        type: "qa",
        front,
        back,
        provenance: { pages: [1], excerpt },
      },
    ],
  });
}

const COMPOUND_QA = JSON.stringify({
  cards: [
    {
      type: "qa",
      front:
        "What is IgA and which mucosa and how does it protect versus IgG?",
      back: "Mucosa",
      provenance: { pages: [1], excerpt: "IgA protects mucosa" },
    },
  ],
});

function stubWriteOnlyBySpan(
  env: Bindings,
  bySpan: Record<string, string>,
) {
  const run = vi.fn(async (_model: string, input: unknown) => {
    expect(_model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
    const messages = (
      input as { messages?: Array<{ role: string; content: string }> }
    ).messages;
    const system = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(system.toLowerCase()).not.toMatch(/extract/);
    const user = messages?.find((m) => m.role === "user")?.content ?? "";
    const span =
      Object.keys(bySpan).find((s) => user.includes(s)) ??
      Object.keys(bySpan)[0]!;
    return {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: bySpan[span]!,
          },
          finish_reason: "stop" as const,
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    };
  });
  env.AI = { run } as unknown as Ai;
  return run;
}

const msg = {
  jobId: "job-a",
  materialId: "mat-a",
  deckId: "deck-a",
};

describe("runClaimOrphanFillPhase", () => {
  it("fills orphan claims without extract", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    await seedClaimsOrphan(env, {
      id: "cl-2",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:03:00.000Z",
    });
    await seedClaimsOrphan(env, {
      id: "cl-3",
      subject: "IgM",
      span: "IgM is first response",
      createdAt: "2026-01-01T01:04:00.000Z",
    });
    stubWriteOnlyBySpan(env, {
      "IgA protects mucosa": qaJson(
        "What does IgA protect?",
        "Mucosa",
        "IgA protects mucosa",
      ),
      "IgG is in blood": qaJson(
        "Where is IgG?",
        "Blood",
        "IgG is in blood",
      ),
      "IgM is first response": qaJson(
        "What is IgM?",
        "First response",
        "IgM is first response",
      ),
    });

    const summary = await runClaimOrphanFillPhase(env, {
      ...msg,
      autoFollowup: false,
    });
    expect(summary.filled).toBe(3);
    expect(summary.attempted).toBe(3);
    const withClaim = (await getCards(env)).filter((c) => c.claim_id != null);
    expect(withClaim).toHaveLength(3);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("caps at AUTO_ORPHAN_FILL_CAP and leaves leftovers", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    const bySpan: Record<string, string> = {};
    for (let i = 0; i < 7; i += 1) {
      const span = `Fact ${i} about topic`;
      await seedClaimsOrphan(env, {
        id: `cl-${i}`,
        subject: `S${i}`,
        span,
        createdAt: `2026-01-01T01:0${i}:00.000Z`,
      });
      bySpan[span] = qaJson(
        `What is fact ${i} about the topic?`,
        `Answer ${i}`,
        span,
      );
    }
    stubWriteOnlyBySpan(env, bySpan);

    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.attempted).toBe(AUTO_ORPHAN_FILL_CAP);
    expect(summary.filled).toBe(AUTO_ORPHAN_FILL_CAP);
    expect((await getCards(env)).filter((c) => c.claim_id != null)).toHaveLength(
      AUTO_ORPHAN_FILL_CAP,
    );
    const linkedIds = new Set(
      (await getCards(env)).map((c) => c.claim_id).filter(Boolean),
    );
    const stillOrphan = (await getStudyClaims(env))
      .filter((c) => c.job_id === "job-a" && !linkedIds.has(c.id));
    expect(stillOrphan).toHaveLength(2);
  });

  it("stops on free-gen capacity and keeps earlier fills", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    await seedClaimsOrphan(env, {
      id: "cl-2",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:03:00.000Z",
    });
    stubWriteOnlyBySpan(env, {
      "IgA protects mucosa": qaJson(
        "What does IgA protect?",
        "Mucosa",
        "IgA protects mucosa",
      ),
      "IgG is in blood": qaJson(
        "Where is IgG?",
        "Blood",
        "IgG is in blood",
      ),
    });

    for (let i = 0; i < FREE_GEN_DAILY_CAP - 1; i += 1) {
      await consumeFreeGenSlot(env, "user-a");
    }

    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.filled).toBe(1);
    expect(summary.attempted).toBe(2);
    expect((await getCards(env)).filter((c) => c.claim_id != null)).toHaveLength(1);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("soft-skips Layer-1 fail and continues", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-bad",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    await seedClaimsOrphan(env, {
      id: "cl-good",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:03:00.000Z",
    });
    const run = vi.fn(async (_model: string, input: unknown) => {
      const messages = (
        input as { messages?: Array<{ role: string; content: string }> }
      ).messages;
      const user = messages?.find((m) => m.role === "user")?.content ?? "";
      const content = user.includes("IgG is in blood")
        ? qaJson("Where is IgG?", "Blood", "IgG is in blood")
        : COMPOUND_QA;
      return {
        choices: [
          {
            index: 0,
            message: { role: "assistant" as const, content },
            finish_reason: "stop" as const,
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
      };
    });
    env.AI = { run } as unknown as Ai;

    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.filled).toBe(1);
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect((await getCards(env)).some((c) => c.claim_id === "cl-good")).toBe(true);
    expect((await getCards(env)).some((c) => c.claim_id === "cl-bad")).toBe(false);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("treats already-linked as covered without duplicate", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-linked",
      subject: "X",
      span: "Already linked span",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    await seedCard(env, {
      id: "card-existing",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Existing?"),
      back_json: JSON.stringify("Yes"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:03:00.000Z",
      updated_at: "2026-01-01T01:03:00.000Z",
      claim_id: "cl-linked",
    });
    await seedClaimsOrphan(env, {
      id: "cl-open",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:04:00.000Z",
    });
    stubWriteOnlyBySpan(env, {
      "IgG is in blood": qaJson(
        "Where is IgG?",
        "Blood",
        "IgG is in blood",
      ),
    });

    const before = (await getCards(env)).length;
    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.filled).toBe(1);
    expect((await getCards(env)).length).toBe(before + 1);
    expect(
      (await getCards(env)).filter((c) => c.claim_id === "cl-linked"),
    ).toHaveLength(1);
  });

  it("stops when capacity is remapped to a plain Error", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    await seedClaimsOrphan(env, {
      id: "cl-2",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:03:00.000Z",
    });
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: qaJson(
                  "What does IgA protect?",
                  "Mucosa",
                  "IgA protects mucosa",
                ),
              },
              finish_reason: "stop" as const,
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
        };
      }
      const err = new Error(
        "Workers AI is temporarily at capacity. Add your own key.",
      );
      throw err;
    });
    env.AI = { run } as unknown as Ai;

    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.filled).toBe(1);
    expect(summary.attempted).toBe(2);
    expect((await getCards(env)).filter((c) => c.claim_id != null)).toHaveLength(1);
  });

  it("no-ops when job is not needs_review", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedGenerationJob(env, {
      id: "job-a",
      material_id: "mat-a",
      status: "running",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    await seedClaimsOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    stubWriteOnlyBySpan(env, {
      "IgA protects mucosa": qaJson(
        "What does IgA protect?",
        "Mucosa",
        "IgA protects mucosa",
      ),
    });

    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary).toEqual({ attempted: 0, filled: 0, skipped: 0 });
    expect((await getCards(env))).toHaveLength(0);
  });
});
