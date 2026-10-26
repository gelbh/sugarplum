import type { Env } from "../env";
import { getDb } from "../db/client";

export type GenerateQueueMessage = {
  jobId: string;
  materialId: string;
  deckId: string;
};

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Insert a queued generation_jobs row and send to GENERATE_QUEUE when bound.
 * Returns the new job id.
 */
export async function enqueueGeneration(
  env: Env,
  args: { materialId: string; deckId: string },
): Promise<string> {
  const jobId = newId();
  const createdAt = new Date().toISOString();
  const db = getDb(env);

  await db
    .prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(jobId, args.materialId, "queued", null, null, createdAt, null)
    .run();

  const message: GenerateQueueMessage = {
    jobId,
    materialId: args.materialId,
    deckId: args.deckId,
  };

  if (env.GENERATE_QUEUE) {
    await env.GENERATE_QUEUE.send(message);
  }

  return jobId;
}
