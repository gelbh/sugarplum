/** Durable usage_events writes from generation job progress_json. */

export type UsageFromProgress = {
  path: "free" | "byo" | null;
  provider: string | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
};

function asFiniteInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/** Extract token/path fields from a generation job progress_json blob. */
export function usageFieldsFromProgress(
  progressJson: string | null | undefined,
): UsageFromProgress {
  if (!progressJson) {
    return {
      path: null,
      provider: null,
      tokens_prompt: null,
      tokens_completion: null,
      tokens_total: null,
    };
  }
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(progressJson) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    /* corrupt → empty */
  }
  const path =
    parsed.path === "free" || parsed.path === "byo" ? parsed.path : null;
  const provider =
    typeof parsed.provider === "string" && parsed.provider.trim()
      ? parsed.provider.trim()
      : null;
  const tokens_prompt = asFiniteInt(parsed.tokens_prompt);
  const tokens_completion = asFiniteInt(parsed.tokens_completion);
  let tokens_total = asFiniteInt(parsed.tokens_used);
  if (
    tokens_total == null &&
    (tokens_prompt != null || tokens_completion != null)
  ) {
    tokens_total = (tokens_prompt ?? 0) + (tokens_completion ?? 0);
  }
  return {
    path,
    provider,
    tokens_prompt,
    tokens_completion,
    tokens_total,
  };
}

/** @returns true when a new row was inserted */
export async function recordGenerationUsageEvent(
  db: D1Database,
  args: {
    userId: string;
    jobId: string;
    progressJson: string | null | undefined;
    createdAt?: string;
  },
): Promise<boolean> {
  const fields = usageFieldsFromProgress(args.progressJson);
  const createdAt = args.createdAt ?? new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO usage_events (
        id, user_id, job_id, kind, path, provider,
        tokens_prompt, tokens_completion, tokens_total, created_at
      ) VALUES (?, ?, ?, 'generation', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      args.userId,
      args.jobId,
      fields.path,
      fields.provider,
      fields.tokens_prompt,
      fields.tokens_completion,
      fields.tokens_total,
      createdAt,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Resolve job → user + progress, then insert (idempotent on job_id). */
export async function recordGenerationUsageEventForJob(
  db: D1Database,
  jobId: string,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT j.progress_json AS progress_json, d.user_id AS user_id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ?`,
    )
    .bind(jobId)
    .first<{ progress_json: string | null; user_id: string }>();
  if (!row) return;
  await recordGenerationUsageEvent(db, {
    userId: row.user_id,
    jobId,
    progressJson: row.progress_json,
  });
}

/** One-shot: insert events for finished jobs that lack a usage row. */
export async function backfillUsageEventsFromJobs(
  db: D1Database,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT j.id AS id, j.progress_json AS progress_json, d.user_id AS user_id,
              j.finished_at AS finished_at
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       LEFT JOIN usage_events ue ON ue.job_id = j.id
       WHERE j.finished_at IS NOT NULL AND ue.id IS NULL`,
    )
    .all<{
      id: string;
      progress_json: string | null;
      user_id: string;
      finished_at: string;
    }>();

  let inserted = 0;
  for (const row of results ?? []) {
    const ok = await recordGenerationUsageEvent(db, {
      userId: row.user_id,
      jobId: row.id,
      progressJson: row.progress_json,
      createdAt: row.finished_at,
    });
    if (ok) inserted += 1;
  }
  return inserted;
}
