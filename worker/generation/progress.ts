/** Stage catalog weights (design §3.2). Sum to 1.0. */
export const STAGE_WEIGHTS = {
  queued: 0.02,
  extract: 0.08,
  rules: 0.05,
  generate: 0.45,
  critique: 0.3,
  persist: 0.1,
} as const;

export type ProgressStage = keyof typeof STAGE_WEIGHTS;

const STAGE_ORDER: ProgressStage[] = [
  "queued",
  "extract",
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

/** Effective weights for stages present in this run; skipped weights roll into generate. */
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

  if (skipped > 0 && present.has("generate")) {
    weights.generate += skipped;
  }

  return weights;
}

/**
 * Honest weighted percent: completed stage weights + current stage * (done/total).
 * When total is 0, within-stage fraction is 0. Result clamped to [0, 100].
 */
export function computePercent(
  stage: ProgressStage,
  current: number,
  total: number,
  presentStages: readonly ProgressStage[],
): number {
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
