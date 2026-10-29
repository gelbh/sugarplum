import type { D1Database } from "@cloudflare/workers-types";

export type JourneyGenerationStatus = {
  openReviewJobId: string | null;
  pendingGenerationJobId: string | null;
};

const pendingStatuses = new Set(["queued", "running", "failed"]);

/** Owner-scoped open-review + pending job ids (shell + full journey). */
export async function loadJourneyGenerationStatus(
  db: D1Database,
  userId: string,
): Promise<JourneyGenerationStatus> {
  const [openJob, pendingJob] = await Promise.all([
    db
      .prepare(
        `SELECT j.id FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ? AND j.status = 'needs_review'
         AND EXISTS (SELECT 1 FROM cards c WHERE c.job_id = j.id AND c.status = 'draft')
       ORDER BY j.created_at DESC LIMIT 1`,
      )
      .bind(userId)
      .first<{ id: string }>(),
    db
      .prepare(
        `SELECT j.id, j.status FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ?
       ORDER BY j.created_at DESC LIMIT 1`,
      )
      .bind(userId)
      .first<{ id: string; status: string }>(),
  ]);

  return {
    openReviewJobId: openJob?.id ?? null,
    pendingGenerationJobId:
      pendingJob && pendingStatuses.has(pendingJob.status)
        ? pendingJob.id
        : null,
  };
}
