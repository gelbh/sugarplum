import type { Env } from "../env";
import { getDb } from "../db/client";

export type FigureExtractMode = "fast" | "accurate";

export type MaterialGenerateQueueMessage = {
  kind?: "generate";
  jobId: string;
  materialId: string;
  deckId: string;
  /**
   * Initial enqueue only. Absent or false skips the automatic gap-fill pass
   * so regen and in-flight messages do not start one.
   */
  autoFollowup?: boolean;
};

export type CardRegenQueueMessage = {
  kind: "cardRegen";
  opId: string;
  cardId: string;
  userId: string;
  type: "qa" | "cloze" | "mcq";
};

/** Material generate only; card regen uses CARD_REGEN_QUEUE. */
export type GenerateQueueMessage = MaterialGenerateQueueMessage;

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Insert a queued generation_jobs row and send to GENERATE_QUEUE when bound.
 * Returns the new job id. Mode lives on D1 only (regen requeues without it).
 * Atlas make-cards uses `createAtlasMakeCardsJob` instead.
 */
export async function enqueueGeneration(
  env: Env,
  args: {
    materialId: string;
    deckId: string;
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[] | null;
    /** Atlas Make cards: entry key + citations for draft provenance. */
    atlasEntryId?: string | null;
    atlasCitations?: string[] | null;
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
  const atlasProvenanceJson =
    args.atlasEntryId && args.atlasEntryId.trim()
      ? JSON.stringify({
          atlasEntryId: args.atlasEntryId.trim(),
          citations: (args.atlasCitations ?? []).filter(
            (c) => typeof c === "string" && c.trim().length > 0,
          ),
        })
      : null;
  const db = getDb(env);

  await db
    .prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at, figure_extract_mode, topic_hints_json, atlas_provenance_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      atlasProvenanceJson,
    )
    .run();

  await requeueGeneration(env, {
    jobId,
    materialId: args.materialId,
    deckId: args.deckId,
    autoFollowup: true,
  });

  return jobId;
}

/** Send an existing job onto GENERATE_QUEUE when bound (no new row). */
export async function requeueGeneration(
  env: Env,
  message: MaterialGenerateQueueMessage,
): Promise<void> {
  if (env.GENERATE_QUEUE) {
    await env.GENERATE_QUEUE.send(message);
  }
}

export async function enqueueCardRegen(
  env: Env,
  message: CardRegenQueueMessage,
): Promise<void> {
  if (env.CARD_REGEN_QUEUE) {
    await env.CARD_REGEN_QUEUE.send(message);
  }
}
