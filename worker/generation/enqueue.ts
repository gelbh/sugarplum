import type { Env } from "../env";
import { getDb } from "../db/client";

export type FigureExtractMode = "fast" | "accurate";

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
 * Returns the new job id. Mode lives on D1 only (regen requeues without it).
 */
export async function enqueueGeneration(
  env: Env,
  args: {
    materialId: string;
    deckId: string;
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[] | null;
  },
): Promise<string> {
  const jobId = newId();
  const createdAt = new Date().toISOString();
  const figureExtractMode =
    args.figureExtractMode === "accurate" ? "accurate" : "fast";
  const topicHintsJson =
    args.topicHints && args.topicHints.length > 0
      ? JSON.stringify(args.topicHints)
      : null;
  const db = getDb(env);

  await db
    .prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at, figure_extract_mode, topic_hints_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      jobId,
      args.materialId,
      "queued",
      null,
      null,
      createdAt,
      null,
      figureExtractMode,
      topicHintsJson,
    )
    .run();

  await requeueGeneration(env, {
    jobId,
    materialId: args.materialId,
    deckId: args.deckId,
  });

  return jobId;
}

/** Send an existing job onto GENERATE_QUEUE when bound (no new row). */
export async function requeueGeneration(
  env: Env,
  message: GenerateQueueMessage,
): Promise<void> {
  if (env.GENERATE_QUEUE) {
    await env.GENERATE_QUEUE.send(message);
  }
}
