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

export type ProgressEvent = {
  at: string;
  kind: "excerpt" | "draft" | "stage";
  stage: string;
  text: string;
};

export type ProgressPatch = {
  stage: ProgressStage;
  current: number;
  total: number;
  percent: number;
  label: string;
  /** ISO heartbeat written on every progress emit (stale-running reclaim). */
  updated_at?: string;
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  drafts_so_far?: number;
  events?: ProgressEvent[];
  path?: "free" | "byo";
};

/** Queue redelivery may reclaim `running` jobs with no progress newer than this. */
export const RUNNING_JOB_STALE_MS = 20 * 60 * 1000;

/**
 * True when the newest progress heartbeat (updated_at, else events[].at, else
 * created_at) is at least RUNNING_JOB_STALE_MS before now.
 */
export function isRunningJobStale(
  progressJson: string | null | undefined,
  createdAt: string,
  nowMs: number = Date.now(),
): boolean {
  let lastMs = Number.NaN;

  if (progressJson) {
    try {
      const parsed = JSON.parse(progressJson) as {
        updated_at?: unknown;
        events?: Array<{ at?: unknown }>;
      };
      if (typeof parsed.updated_at === "string") {
        const t = Date.parse(parsed.updated_at);
        if (Number.isFinite(t)) lastMs = t;
      }
      for (const event of parsed.events ?? []) {
        if (typeof event?.at !== "string") continue;
        const t = Date.parse(event.at);
        if (!Number.isFinite(t)) continue;
        lastMs = Number.isFinite(lastMs) ? Math.max(lastMs, t) : t;
      }
    } catch {
      // Corrupt progress_json: fall back to created_at.
    }
  }

  if (!Number.isFinite(lastMs)) {
    lastMs = Date.parse(createdAt);
    if (!Number.isFinite(lastMs)) lastMs = 0;
  }

  return nowMs - lastMs >= RUNNING_JOB_STALE_MS;
}

/** Strip C0 control chars except newline and space; cap length. */
export function truncateProgressText(text: string, max = 160): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 0x0a || code === 0x20 || (code > 0x20 && code !== 0x7f)) {
      out += ch;
    }
  }
  return out.length <= max ? out : out.slice(0, max);
}

/** Append a progress event; keep at most `max` newest (drop oldest). */
export function pushProgressEvent(
  events: ProgressEvent[] | undefined,
  event: ProgressEvent,
  max = 12,
): ProgressEvent[] {
  const next = [...(events ?? []), event];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

export type TokenUsageAcc = {
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
};

export type TokenUsageDelta = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

/** Sum LLM usage into a progress accumulator (multi-call jobs). */
export function accumulateTokenUsage(
  acc: TokenUsageAcc,
  usage: TokenUsageDelta,
): void {
  if (usage.completion_tokens != null) {
    acc.tokens_completion =
      (acc.tokens_completion ?? 0) + usage.completion_tokens;
  }
  if (usage.prompt_tokens != null) {
    acc.tokens_prompt = (acc.tokens_prompt ?? 0) + usage.prompt_tokens;
  }
  if (usage.total_tokens != null) {
    acc.tokens_used = (acc.tokens_used ?? 0) + usage.total_tokens;
  } else if (acc.tokens_prompt != null || acc.tokens_completion != null) {
    acc.tokens_used = (acc.tokens_prompt ?? 0) + (acc.tokens_completion ?? 0);
  }
}

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

/** PDF with figures but no usable text (no rules/generate/critique band). */
export const PDF_FIGURE_ONLY_STAGES = [
  "queued",
  "extract",
  "figures",
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
  // Do not jump to 100 when a mid-pipeline stage finishes; later stages still weigh.
  const weights = effectiveWeights(presentStages);
  const present = presentStages.filter((s) => weights[s] > 0 || s === stage);
  const ordered = STAGE_ORDER.filter((s) => present.includes(s));

  let completed = 0;
  for (const s of ordered) {
    if (s === stage) break;
    completed += weights[s];
  }

  const within = total > 0 ? Math.max(0, current) / total : 0;
  const raw = 100 * (completed + weights[stage] * within);
  const capped = Math.min(100, Math.max(0, raw));
  // Last catalog stage finished: snap float dust to 100.
  if (
    total > 0 &&
    current >= total &&
    ordered.length > 0 &&
    stage === ordered[ordered.length - 1]
  ) {
    return 100;
  }
  return capped;
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
  const body: Record<string, unknown> = {
    stage: patch.stage,
    current: patch.current,
    total: patch.total,
    percent: patch.percent,
    label: patch.label,
  };
  if (patch.updated_at !== undefined) body.updated_at = patch.updated_at;
  if (patch.tokens_used !== undefined) body.tokens_used = patch.tokens_used;
  if (patch.tokens_prompt !== undefined)
    body.tokens_prompt = patch.tokens_prompt;
  if (patch.tokens_completion !== undefined) {
    body.tokens_completion = patch.tokens_completion;
  }
  if (patch.drafts_so_far !== undefined)
    body.drafts_so_far = patch.drafts_so_far;
  if (patch.events !== undefined) body.events = patch.events;
  if (patch.path !== undefined) body.path = patch.path;
  return JSON.stringify(body);
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
