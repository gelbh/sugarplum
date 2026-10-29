import { describe, expect, it, vi } from "vitest";
import { handleExportQueue } from "../../worker/export/consumer";
import type { ExportQueueMessage } from "../../worker/export/enqueue";
import {
  EXPORT_QUEUE_MAX_RETRIES,
  EXPORT_QUEUE_RETRY_DELAY_SEC,
  EXPORT_RUNNING_STALE_MS,
} from "../../worker/export/stale";
import { createTestEnv } from "./test-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const user = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function mockBatch(messages: ExportQueueMessage[]) {
  return {
    queue: "sugarplum-export",
    messages: messages.map((body) => ({
      body,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
  } as unknown as MessageBatch<ExportQueueMessage>;
}

async function insertQueuedExport(
  env: ReturnType<typeof createTestEnv>,
  exportId: string,
  status = "queued",
  updatedAt = user.created_at,
) {
  const r2Key = `exports/${user.id}/${exportId}.apkg`;
  await env.DB.prepare(
    `INSERT INTO export_jobs
     (id, user_id, status, request_json, r2_key, error, warning_json,
      created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  )
    .bind(
      exportId,
      user.id,
      status,
      JSON.stringify({ type: "deck", deckId: "deck-a" }),
      r2Key,
      JSON.stringify({ missingMedia: 0, skippedCards: 0 }),
      user.created_at,
      updatedAt,
      "2099-01-01T00:00:00.000Z",
    )
    .run();
  return r2Key;
}

function seedOwnedDeck(env: ReturnType<typeof createTestEnv>) {
  env.seedUser(user);
  env.seedSubject({
    id: "subject-a",
    user_id: user.id,
    title: "Anatomy",
    created_at: user.created_at,
  });
  env.seedDeck({
    id: "deck-a",
    user_id: user.id,
    title: "Bones",
    subject_hint: null,
    subject_id: "subject-a",
    created_at: user.created_at,
  });
  env.seedCard({
    id: "card-a",
    deck_id: "deck-a",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("What is the femur?"),
    back_json: JSON.stringify("The thigh bone"),
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: user.created_at,
    updated_at: user.created_at,
  });
}

describe("handleExportQueue", () => {
  it("builds a queued export to ready with R2 object", async () => {
    const env = createTestEnv();
    seedOwnedDeck(env);
    const exportId = "export-async-1";
    const r2Key = await insertQueuedExport(env, exportId);

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);

    const job = env.getExportJobs().find((row) => row.id === exportId);
    expect(job?.status).toBe("ready");
    expect(job?.r2_key).toBe(r2Key);
    expect(env.getR2(r2Key)).toBeDefined();
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
    expect(batch.messages[0]?.retry).not.toHaveBeenCalled();
  });

  it("acks and skips jobs that are already ready", async () => {
    const env = createTestEnv();
    env.seedUser(user);
    const exportId = "export-ready-1";
    await insertQueuedExport(env, exportId, "ready");

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
    expect(env.getExportJobs()[0]?.status).toBe("ready");
  });

  it("retries busy when running job is not stale", async () => {
    const env = createTestEnv();
    env.seedUser(user);
    const exportId = "export-running-fresh";
    await insertQueuedExport(
      env,
      exportId,
      "running",
      new Date().toISOString(),
    );

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);

    expect(batch.messages[0]?.ack).not.toHaveBeenCalled();
    expect(batch.messages[0]?.retry).toHaveBeenCalledWith({
      delaySeconds: EXPORT_QUEUE_RETRY_DELAY_SEC,
    });
    expect(env.getExportJobs()[0]?.status).toBe("running");
    expect(env.getR2(`exports/${user.id}/${exportId}.apkg`)).toBeUndefined();
  });

  it("reclaims stale running jobs and builds to ready", async () => {
    const env = createTestEnv();
    seedOwnedDeck(env);
    const exportId = "export-running-stale";
    const staleAt = new Date(
      Date.now() - EXPORT_RUNNING_STALE_MS - 1000,
    ).toISOString();
    const r2Key = await insertQueuedExport(env, exportId, "running", staleAt);

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);

    expect(env.getExportJobs()[0]?.status).toBe("ready");
    expect(env.getR2(r2Key)).toBeDefined();
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
  });

  it("acks lost claim without rebuilding when another worker finished", async () => {
    const env = createTestEnv();
    seedOwnedDeck(env);
    const exportId = "export-lost-claim";
    await insertQueuedExport(env, exportId, "queued");

    const originalPrepare = env.DB.prepare.bind(env.DB);
    let sawClaimUpdate = false;
    env.DB.prepare = ((sql: string) => {
      const stmt = originalPrepare(sql);
      if (
        sql.includes("UPDATE export_jobs SET status") &&
        sql.includes("AND status = ?")
      ) {
        return {
          bind: (...args: unknown[]) => ({
            run: async () => {
              sawClaimUpdate = true;
              // Simulate lost race: flip row to ready before claim "applies".
              const jobs = env.getExportJobs();
              const job = jobs.find((row) => row.id === exportId);
              if (job) job.status = "ready";
              return { meta: { changes: 0 } };
            },
            first: stmt.bind(...args).first.bind(stmt.bind(...args)),
            all: stmt.bind(...args).all.bind(stmt.bind(...args)),
          }),
        };
      }
      return stmt;
    }) as typeof env.DB.prepare;

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);

    expect(sawClaimUpdate).toBe(true);
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
    expect(batch.messages[0]?.retry).not.toHaveBeenCalled();
    expect(env.getR2(`exports/${user.id}/${exportId}.apkg`)).toBeUndefined();
  });
});

describe("export queue wrangler sync", () => {
  it("keeps sugarplum-export max_retries in sync with stale window", () => {
    const wrangler = readFileSync(
      resolve(__dirname, "../../wrangler.jsonc"),
      "utf8",
    );
    expect(wrangler).toContain(`"max_retries": ${EXPORT_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${EXPORT_QUEUE_RETRY_DELAY_SEC}`,
    );
  });
});
