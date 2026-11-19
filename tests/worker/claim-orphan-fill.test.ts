import { describe, expect, it, vi } from "vitest";
import {
  AUTO_ORPHAN_FILL_CAP,
  runClaimOrphanFillPhase,
} from "../../worker/generation/claim-orphan-fill";
import { FREE_GEN_DAILY_CAP, consumeFreeGenSlot } from "../../worker/generation/quota";
import { WORKERS_AI_MODEL } from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

function seedOwnerNeedsReview(env: ReturnType<typeof createTestEnv>) {
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
  env.seedMaterial({
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedGenerationJob({
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
}

function seedOrphan(
  env: ReturnType<typeof createTestEnv>,
  args: { id: string; subject: string; span: string; createdAt: string },
) {
  env.seedStudyClaim({
    id: args.id,
    job_id: "job-a",
    deck_id: "deck-a",
    subject: args.subject,
    predicate: "fact",
    object: null,
    source_span: args.span,
    qualifiers_json: null,
    pages_json: "[1]",
    created_at: args.createdAt,
  });
}

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
  env: ReturnType<typeof createTestEnv>,
  bySpan: Record<string, string>,
) {
  const run = vi.fn(async (_model: string, input: unknown) => {
    expect(_model).toBe(WORKERS_AI_MODEL);
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
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    seedOrphan(env, {
      id: "cl-2",
      subject: "IgG",
      span: "IgG is in blood",
      createdAt: "2026-01-01T01:03:00.000Z",
    });
    seedOrphan(env, {
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
    const withClaim = env.getCards().filter((c) => c.claim_id != null);
    expect(withClaim).toHaveLength(3);
    expect(
      env.getGenerationJobs().find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("caps at AUTO_ORPHAN_FILL_CAP and leaves leftovers", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    const bySpan: Record<string, string> = {};
    for (let i = 0; i < 7; i += 1) {
      const span = `Fact ${i} about topic`;
      seedOrphan(env, {
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
    expect(env.getCards().filter((c) => c.claim_id != null)).toHaveLength(
      AUTO_ORPHAN_FILL_CAP,
    );
    const linkedIds = new Set(
      env.getCards().map((c) => c.claim_id).filter(Boolean),
    );
    const stillOrphan = env
      .getStudyClaims()
      .filter((c) => c.job_id === "job-a" && !linkedIds.has(c.id));
    expect(stillOrphan).toHaveLength(2);
  });

  it("stops on free-gen capacity and keeps earlier fills", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    seedOrphan(env, {
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
    expect(env.getCards().filter((c) => c.claim_id != null)).toHaveLength(1);
    expect(
      env.getGenerationJobs().find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("soft-skips Layer-1 fail and continues", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphan(env, {
      id: "cl-bad",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    seedOrphan(env, {
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
    expect(env.getCards().some((c) => c.claim_id === "cl-good")).toBe(true);
    expect(env.getCards().some((c) => c.claim_id === "cl-bad")).toBe(false);
    expect(
      env.getGenerationJobs().find((j) => j.id === "job-a")?.status,
    ).toBe("needs_review");
  });

  it("treats already-linked as covered without duplicate", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphan(env, {
      id: "cl-linked",
      subject: "X",
      span: "Already linked span",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    env.seedCard({
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
    seedOrphan(env, {
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

    const before = env.getCards().length;
    const summary = await runClaimOrphanFillPhase(env, msg);
    expect(summary.filled).toBe(1);
    expect(env.getCards().length).toBe(before + 1);
    expect(
      env.getCards().filter((c) => c.claim_id === "cl-linked"),
    ).toHaveLength(1);
  });

  it("stops when capacity is remapped to a plain Error", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphan(env, {
      id: "cl-1",
      subject: "IgA",
      span: "IgA protects mucosa",
      createdAt: "2026-01-01T01:02:00.000Z",
    });
    seedOrphan(env, {
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
    expect(env.getCards().filter((c) => c.claim_id != null)).toHaveLength(1);
  });

  it("no-ops when job is not needs_review", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    env.seedGenerationJob({
      id: "job-a",
      material_id: "mat-a",
      status: "running",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    seedOrphan(env, {
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
    expect(env.getCards()).toHaveLength(0);
  });
});
