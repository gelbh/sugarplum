import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  resetTestDb,
  seedClaimsNeedsReviewOwner,
  seedClaimsOrphan,
  seedGenerationJob,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_ORPHAN_FILL_CAP,
  FILL_ALL_REQUEST_CAP,
  FILL_ALL_SOFT_FAIL_BUDGET,
  fillOrphanClaims,
} from "../../worker/generation/claim-orphan-fill";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../worker/generation/claim-card-fallback";

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

describe("fillOrphanClaims", () => {
  it("keeps AUTO_ORPHAN_FILL_CAP at 5 and FILL_ALL_REQUEST_CAP at 8", () => {
    expect(AUTO_ORPHAN_FILL_CAP).toBe(5);
    expect(FILL_ALL_REQUEST_CAP).toBe(8);
  });

  it("caps at FILL_ALL_REQUEST_CAP and reports remaining", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    const bySpan: Record<string, string> = {};
    const totalOrphans = FILL_ALL_REQUEST_CAP + 4;
    for (let i = 0; i < totalOrphans; i += 1) {
      const span = `Fact ${i} about topic`;
      await seedClaimsOrphan(env, {
        id: `cl-${i}`,
        subject: `S${i}`,
        span,
        createdAt: `2026-01-01T01:${String(i).padStart(2, "0")}:00.000Z`,
      });
      bySpan[span] = qaJson(
        `What is fact ${i} about the topic?`,
        `Answer ${i}`,
        span,
      );
    }
    stubWriteOnlyBySpan(env, bySpan);

    const result = await fillOrphanClaims({
      env,
      userId: "user-a",
      jobId: "job-a",
      cap: FILL_ALL_REQUEST_CAP,
    });
    expect(result.attempted).toBe(FILL_ALL_REQUEST_CAP);
    expect(result.filled).toBe(FILL_ALL_REQUEST_CAP);
    expect(result.cards).toHaveLength(FILL_ALL_REQUEST_CAP);
    expect(result.remaining).toBe(4);
    expect((await getCards(env)).filter((c) => c.claim_id != null)).toHaveLength(
      FILL_ALL_REQUEST_CAP,
    );
  });

  it("stops re-attempting orphans after soft-fail budget", async () => {
    const env = cfEnv;
    await seedClaimsNeedsReviewOwner(env);
    await seedClaimsOrphan(env, {
      id: "cl-bad",
      subject: "Junk",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    const run = vi.fn(async () => ({
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: COMPOUND_QA },
          finish_reason: "stop" as const,
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    }));
    env.AI = { run } as unknown as Ai;

    const first = await fillOrphanClaims({
      env,
      userId: "user-a",
      jobId: "job-a",
      cap: FILL_ALL_REQUEST_CAP,
      softFailBudget: FILL_ALL_SOFT_FAIL_BUDGET,
    });
    expect(first.attempted).toBe(1);
    expect(first.filled).toBe(0);
    expect(first.skipped).toBe(1);
    expect(first.softFailCounts?.["cl-bad"]).toBe(1);
    expect(first.softFailBudgetExhausted).toBe(false);

    const second = await fillOrphanClaims({
      env,
      userId: "user-a",
      jobId: "job-a",
      cap: FILL_ALL_REQUEST_CAP,
      softFailBudget: FILL_ALL_SOFT_FAIL_BUDGET,
      softFailCounts: first.softFailCounts,
    });
    expect(second.attempted).toBe(1);
    expect(second.softFailCounts?.["cl-bad"]).toBe(2);

    const third = await fillOrphanClaims({
      env,
      userId: "user-a",
      jobId: "job-a",
      cap: FILL_ALL_REQUEST_CAP,
      softFailBudget: FILL_ALL_SOFT_FAIL_BUDGET,
      softFailCounts: second.softFailCounts,
    });
    expect(third.attempted).toBe(0);
    expect(third.softFailBudgetExhausted).toBe(true);
    expect(third.remaining).toBe(1);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns zeros when job is not needs_review", async () => {
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

    const result = await fillOrphanClaims({
      env,
      userId: "user-a",
      jobId: "job-a",
      cap: FILL_ALL_REQUEST_CAP,
    });
    expect(result).toEqual({
      attempted: 0,
      filled: 0,
      skipped: 0,
      remaining: 0,
      cards: [],
      inconclusive: true,
      softFailCounts: {},
    });
  });
});
