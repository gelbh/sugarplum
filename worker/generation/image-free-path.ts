import type { Env } from "../env";
import {
  enqueueGeneration,
  type FigureExtractMode,
} from "./enqueue";
import { BYO_PROVIDERS_PHRASE } from "./llm";

/**
 * Free path has no Workers AI vision. Image auto-generate needs BYO;
 * otherwise clients open DIY occlusion + Suggest regions.
 */
export const IMAGE_MANUAL_OCCLUSION_MESSAGE =
  `Image auto-generation needs an ${BYO_PROVIDERS_PHRASE} API key under Settings. ` +
  "Without a key, create an Occlusion card and use Suggest regions.";

export async function userHasByoSecret(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  // Match consumer/settings SELECT shape so test-env D1 stubs resolve.
  const row = await db
    .prepare(
      "SELECT provider, ciphertext, model FROM user_secrets WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ provider: string }>();
  return Boolean(row);
}

/**
 * Image materials without BYO skip the doomed vision job and signal DIY.
 * Non-image always enqueues when requested.
 */
export async function enqueueOrManualOcclusion(
  env: Env,
  db: D1Database,
  args: {
    userId: string;
    kind: string;
    materialId: string;
    deckId: string;
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[] | null;
  },
): Promise<{ jobId: string | null; manual_occlusion: boolean }> {
  if (args.kind === "image") {
    if (!(await userHasByoSecret(db, args.userId))) {
      return { jobId: null, manual_occlusion: true };
    }
  }
  const jobId = await enqueueGeneration(env, {
    materialId: args.materialId,
    deckId: args.deckId,
    figureExtractMode: args.figureExtractMode,
    topicHints: args.topicHints,
  });
  return { jobId, manual_occlusion: false };
}
