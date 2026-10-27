/** Stage catalog weights (design §3.2). Sum to 1.0. */
export const STAGE_WEIGHTS = {
  queued: 0.02,
  extract: 0.08,
  figures: 0.1,
  rules: 0.05,
  generate: 0.35,
  critique: 0.3,
  persist: 0.1,
} as const;

export type ProgressStage = keyof typeof STAGE_WEIGHTS;

const STAGE_ORDER: ProgressStage[] = [
  "queued",
  "extract",
  "figures",
  "rules",
  "generate",
  "critique",
  "persist",
];

export type ProgressPatch = {
  stage: ProgressStage;
  current: number;
  total: number;
  percent: number;
  label: string;
};

/** Stage catalogs for generation job paths (weights via effectiveWeights). */
export const IMAGE_STAGES = [
  "queued",
  "extract",
  "generate",
  "persist",
] as const satisfies readonly ProgressStage[];

export const TEXT_LLM_STAGES = [
  "queued",
  "extract",
  "rules",
  "generate",
  "critique",
  "persist",
] as const satisfies readonly ProgressStage[];

export const PDF_STAGES = [
  "queued",
  "extract",
  "figures",
  "rules",
  "generate",
  "critique",
  "persist",
] as const satisfies readonly ProgressStage[];

export const RULES_ONLY_STAGES = [
  "queued",
  "extract",
  "rules",
  "persist",
] as const satisfies readonly ProgressStage[];

/**
 * Effective weights for stages present in this run.
 * Skipped weights roll into generate when present, else into persist.
 */
export function effectiveWeights(
  presentStages: readonly ProgressStage[],
): Record<ProgressStage, number> {
  const present = new Set(presentStages);
  const weights: Record<ProgressStage, number> = { ...STAGE_WEIGHTS };

  let skipped = 0;
  for (const stage of STAGE_ORDER) {
    if (!present.has(stage)) {
      skipped += weights[stage];
      weights[stage] = 0;
    }
  }

  if (skipped > 0) {
    if (present.has("generate")) {
      weights.generate += skipped;
    } else if (present.has("persist")) {
      // Rules-only runs omit generate/critique; fold leftover into persist.
      weights.persist += skipped;
    }
  }

  return weights;
}

/**
 * Honest weighted percent: completed stage weights + current stage * (done/total).
 * When total is 0, within-stage fraction is 0. Result clamped to [0, 100].
 * For interleaved generate/critique chunk loops, use computePipelineBandPercent.
 */
export function computePercent(
  stage: ProgressStage,
  current: number,
  total: number,
  presentStages: readonly ProgressStage[],
): number {
  if (total > 0 && current >= total) return 100;
  const weights = effectiveWeights(presentStages);
  const present = presentStages.filter((s) => weights[s] > 0 || s === stage);
  const ordered = STAGE_ORDER.filter((s) => present.includes(s));

  let completed = 0;
  for (const s of ordered) {
    if (s === stage) break;
    completed += weights[s];
  }

  const within =
    total > 0 ? Math.max(0, current) / total : 0;
  const raw = 100 * (completed + weights[stage] * within);
  return Math.min(100, Math.max(0, raw));
}

/**
 * Monotonic percent for interleaved generate/critique over `chunkTotal` chunks.
 * Half-steps 0..2n map across weight(generate)+weight(critique) after pre-generate base.
 */
export function computePipelineBandPercent(
  halfStepsDone: number,
  chunkTotal: number,
  presentStages: readonly ProgressStage[],
): number {
  const weights = effectiveWeights(presentStages);
  let base = 0;
  for (const s of STAGE_ORDER) {
    if (s === "generate") break;
    if (presentStages.includes(s)) base += weights[s];
  }
  const band = weights.generate + weights.critique;
  const denom = Math.max(1, chunkTotal * 2);
  const within = Math.min(1, Math.max(0, halfStepsDone) / denom);
  const raw = 100 * (base + band * within);
  return Math.min(100, Math.max(0, raw));
}

/** Serialize server-side progress fields for progress_json column. */
export function toProgressJson(patch: ProgressPatch): string {
  return JSON.stringify({
    stage: patch.stage,
    current: patch.current,
    total: patch.total,
    percent: patch.percent,
    label: patch.label,
  });
}

/** Persist progress_json on a generation_jobs row. */
export async function writeJobProgress(
  db: D1Database,
  jobId: string,
  patch: ProgressPatch,
): Promise<void> {
  await db
    .prepare("UPDATE generation_jobs SET progress_json = ? WHERE id = ?")
    .bind(toProgressJson(patch), jobId)
    .run();
}
