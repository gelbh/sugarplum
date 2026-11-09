import { HTTPException } from "hono/http-exception";
import { onCardsAccepted } from "../gamification/onStudyEvent";
import {
  fieldsForQualityGate,
  partitionStoredDraftsByQuality,
  type StoredDraftFields,
} from "../generation/storedDraftQuality";

export type AcceptDraftOutcome = "accepted" | "conflict" | "invalid";

type DraftRow = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: string;
  front_json: string;
  back_json: string;
  media_r2_keys_json: string | null;
  provenance_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type AcceptDraftFn = (
  db: D1Database,
  card: { id: string; type: string; back_json: string; status: string },
) => Promise<AcceptDraftOutcome>;

type RejectSiblingsFn = (
  db: D1Database,
  args: { userId: string; excludeJobId: string },
) => Promise<number>;

type SerializeCardFn = (row: DraftRow) => {
  type: string;
  front: unknown;
  back: unknown;
  options?: string[];
  provenance: unknown;
  media_r2_keys: string[];
};

export type AcceptOwnedJobDraftsResult = {
  accepted: number;
  failed: number;
  leftUnsafe: number;
  rejectedSiblingCount: number;
  unlocks: Awaited<ReturnType<typeof onCardsAccepted>>;
};

type RowWithFields = StoredDraftFields & { row: DraftRow };

/**
 * Accept drafts for an owned job.
 * mode "all": every draft (accept-all sibling cleanup when clean).
 * mode "safe": Layer-1 survivors only; never rejects siblings (hub multi-job).
 */
export async function acceptOwnedJobDrafts(
  db: D1Database,
  args: {
    userId: string;
    jobId: string;
    mode: "all" | "safe";
    acceptDraftCard: AcceptDraftFn;
    rejectOwnedSiblingDrafts: RejectSiblingsFn;
    serializeCard: SerializeCardFn;
  },
): Promise<AcceptOwnedJobDraftsResult> {
  const { userId, jobId, mode } = args;

  const job = await db
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!job) throw new HTTPException(404, { message: "Job not found" });

  const { results } = await db
    .prepare(
      `SELECT id, deck_id, job_id, type, front_json, back_json,
              media_r2_keys_json, provenance_json, status, created_at, updated_at
       FROM cards
       WHERE job_id = ? AND status = ? ORDER BY created_at ASC`,
    )
    .bind(jobId, "draft")
    .all<DraftRow>();

  const rows = results ?? [];
  let candidates = rows;
  let leftUnsafe = 0;

  if (mode === "safe") {
    const withFields: RowWithFields[] = rows.map((row) => ({
      row,
      ...fieldsForQualityGate(args.serializeCard(row)),
    }));
    const { safe, unsafe } = partitionStoredDraftsByQuality(withFields);
    candidates = safe.map((item) => item.row);
    leftUnsafe = unsafe.length;
  }

  let accepted = 0;
  let failed = 0;
  const acceptedCards: { cardId: string; cardType: string }[] = [];

  for (const row of candidates) {
    try {
      const outcome = await args.acceptDraftCard(db, row);
      if (outcome === "accepted") {
        accepted += 1;
        acceptedCards.push({ cardId: row.id, cardType: row.type });
      } else {
        failed += 1;
      }
    } catch (err) {
      console.error(`accept-${mode} failed for card`, row.id, err);
      failed += 1;
    }
  }

  const unlocks = await onCardsAccepted(db, userId, acceptedCards);
  const rejectedSiblingCount =
    mode === "all" && accepted > 0 && failed === 0
      ? await args.rejectOwnedSiblingDrafts(db, {
          userId,
          excludeJobId: jobId,
        })
      : 0;

  return {
    accepted,
    failed,
    leftUnsafe,
    rejectedSiblingCount,
    unlocks,
  };
}
