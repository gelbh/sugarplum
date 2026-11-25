import { env as cfEnv } from "cloudflare:workers";
import {
  getGenerationJobs,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  accumulateTokenUsage,
  readStartedAt,
  toProgressJson,
  withUpdatedAt,
  withoutStartedAt,
  writeJobProgress,
} from "../../../worker/generation/progress";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("toProgressJson", () => {
  it("serializes server progress snapshot fields", () => {
    const json = toProgressJson({
      stage: "generate",
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
    });
    expect(JSON.parse(json)).toEqual({
      stage: "generate",
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
    });
  });

  it("includes optional fields when set and omits when absent", () => {
    const full = toProgressJson({
      stage: "generate",
      current: 1,
      total: 3,
      percent: 10,
      label: "Gen",
      tokens_used: 100,
      tokens_prompt: 60,
      tokens_completion: 40,
      drafts_so_far: 2,
      path: "free",
      started_at: "2026-10-29T10:00:00.000Z",
      events: [
        {
          at: "2026-10-27T00:00:00.000Z",
          kind: "draft",
          stage: "generate",
          text: "card draft",
        },
      ],
    });
    expect(JSON.parse(full)).toEqual({
      stage: "generate",
      current: 1,
      total: 3,
      percent: 10,
      label: "Gen",
      tokens_used: 100,
      tokens_prompt: 60,
      tokens_completion: 40,
      drafts_so_far: 2,
      path: "free",
      started_at: "2026-10-29T10:00:00.000Z",
      events: [
        {
          at: "2026-10-27T00:00:00.000Z",
          kind: "draft",
          stage: "generate",
          text: "card draft",
        },
      ],
    });

    const minimal = toProgressJson({
      stage: "queued",
      current: 0,
      total: 0,
      percent: 0,
      label: "Queued",
    });
    const parsed = JSON.parse(minimal) as Record<string, unknown>;
    expect(parsed).toEqual({
      stage: "queued",
      current: 0,
      total: 0,
      percent: 0,
      label: "Queued",
    });
    expect(parsed).not.toHaveProperty("tokens_used");
    expect(parsed).not.toHaveProperty("events");
    expect(parsed).not.toHaveProperty("path");
    expect(parsed).not.toHaveProperty("started_at");
  });

  it("withUpdatedAt claim heartbeat does not invent started_at", () => {
    const next = JSON.parse(withUpdatedAt(null, "2026-10-29T10:00:00.000Z"));
    expect(next).not.toHaveProperty("started_at");
    expect(next.stage).toBe("queued");
  });

  it("readStartedAt returns ISO when present", () => {
    expect(readStartedAt(null)).toBeUndefined();
    expect(
      readStartedAt(
        toProgressJson({
          stage: "generate",
          current: 1,
          total: 2,
          percent: 40,
          label: "Gen",
          started_at: "2026-10-29T10:00:00.000Z",
        }),
      ),
    ).toBe("2026-10-29T10:00:00.000Z");
  });

  it("withoutStartedAt strips started_at for reclaim restart", () => {
    const seeded = toProgressJson({
      stage: "generate",
      current: 1,
      total: 2,
      percent: 40,
      label: "Gen",
      started_at: "2026-10-29T10:00:00.000Z",
    });
    const cleared = withoutStartedAt(seeded);
    expect(cleared).not.toBeNull();
    expect(readStartedAt(cleared)).toBeUndefined();
    expect(JSON.parse(cleared!).stage).toBe("generate");
    expect(withoutStartedAt(null)).toBeNull();
  });
});

describe("writeJobProgress", () => {
  it("persists progress_json on the generation job row", async () => {
    const env = cfEnv;
    const createdAt = "2026-10-26T00:00:00.000Z";
    await seedUser(env, {
      id: "u1",
      email: "a@b.co",
      password_hash: "x",
      oauth_subject: null,
      created_at: createdAt,
    });
    await seedDeck(env, {
      id: "d1",
      user_id: "u1",
      title: "Deck",
      subject_hint: null,
      created_at: createdAt,
    });
    await seedMaterial(env, {
      id: "m1",
      deck_id: "d1",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: createdAt,
    });
    await env.DB.prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("j1", "m1", "running", null, null, createdAt, null)
      .run();

    const patch = {
      stage: "generate" as const,
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
      path: "free" as const,
      drafts_so_far: 3,
      events: [
        {
          at: "2026-10-26T12:00:00.000Z",
          kind: "draft" as const,
          stage: "generate",
          text: "Sample draft preview",
        },
      ],
    };
    await writeJobProgress(env.DB, "j1", patch);

    const jobs = (await getGenerationJobs(env));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].progress_json).toBe(toProgressJson(patch));
    const roundTrip = JSON.parse(jobs[0].progress_json!) as Record<
      string,
      unknown
    >;
    expect(roundTrip.path).toBe("free");
    expect(roundTrip.drafts_so_far).toBe(3);
    expect(roundTrip.events).toHaveLength(1);
  });
});

describe("accumulateTokenUsage", () => {
  it("sums prompt/completion/total across two LLM calls", () => {
    const acc: {
      tokens_used?: number;
      tokens_prompt?: number;
      tokens_completion?: number;
    } = {};
    accumulateTokenUsage(acc, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    accumulateTokenUsage(acc, {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
    });
    expect(acc.tokens_prompt).toBe(30);
    expect(acc.tokens_completion).toBe(13);
    expect(acc.tokens_used).toBe(43);
  });

  it("derives total from prompt+completion when total_tokens absent", () => {
    const acc: {
      tokens_used?: number;
      tokens_prompt?: number;
      tokens_completion?: number;
    } = {};
    accumulateTokenUsage(acc, { prompt_tokens: 4, completion_tokens: 6 });
    expect(acc.tokens_used).toBe(10);
    accumulateTokenUsage(acc, { prompt_tokens: 1, completion_tokens: 2 });
    expect(acc.tokens_prompt).toBe(5);
    expect(acc.tokens_completion).toBe(8);
    expect(acc.tokens_used).toBe(13);
  });
});
