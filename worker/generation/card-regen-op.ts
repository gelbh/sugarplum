import type { Env } from "../env";
import { getDb } from "../db/client";
import { cardContentFingerprint } from "../cards/contentFingerprint";
import { requireOwnedCard } from "../cards/ownership";
import {
  encodeStoredBack,
  parseJsonField,
  type CardRow,
} from "../cards/serialize";
import { studyClaimFromRow, type StudyClaim } from "./claims";
import {
  ClaimAwareRegenError,
  loadCardSourceText,
  regenerateClaimAwareCard,
  resolveRegenLlm,
  type RegenCardType,
} from "./card-regen";
import type { TypedRegenDraft } from "./claim-stages";
import type { CardRegenQueueMessage } from "./enqueue";
import { RUNNING_JOB_STALE_MS } from "./progress";
import {
  parseProvenanceJson,
  provenanceExcerptText,
} from "../../src/study/regenSource";
import { recordRegenUsageEvent } from "./usage";
import type { LlmTokenUsage } from "./llm";
import { WorkersAiCapacityError } from "./workers-ai";

const STUDY_STRUGGLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const STALE_CARD_REGEN_FAIL_ERROR =
  "Card regeneration stalled and was stopped. Try regenerating again.";

export type CardRegenOpRow = {
  id: string;
  card_id: string;
  user_id: string;
  regen_type: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type ApplyRegenResult =
  | { ok: true; updatedAt: string; row: CardRow }
  | { ok: false; error: string };

/**
 * Persist claim-aware regen draft onto one card row (fingerprint + usage).
 * Shared by the async op processor (formerly the sync POST body).
 */
export async function applyClaimAwareRegenToCard(
  env: Env,
  args: {
    userId: string;
    cardId: string;
    row: CardRow;
    draft: TypedRegenDraft;
    usage: LlmTokenUsage | null;
    path: "free" | "byo";
    provider: string;
    releaseQuota: () => Promise<void>;
  },
): Promise<ApplyRegenResult> {
  const db = getDb(env);
  const { draft, usage, cardId, row } = args;
  const nextBackJson =
    draft.type === "mcq"
      ? encodeStoredBack(draft.type, draft.back, draft.options)
      : encodeStoredBack(draft.type, draft.back);
  const nextFrontJson = JSON.stringify(draft.front);
  const nextProvenanceJson = JSON.stringify(draft.provenance);
  const updatedAt = new Date().toISOString();

  const regenFp = await cardContentFingerprint({
    type: draft.type,
    front: draft.front,
    mediaR2Keys: null,
    back: draft.type === "mcq" ? draft.back : undefined,
    options: draft.type === "mcq" ? draft.options : null,
  });
  if (row.claim_id == null) {
    const clash = await db
      .prepare(
        `SELECT id FROM cards
         WHERE deck_id = ? AND claim_id IS NULL AND content_fp = ?
           AND status IN ('draft', 'accepted') AND id != ?
         LIMIT 1`,
      )
      .bind(row.deck_id, regenFp, cardId)
      .first<{ id: string }>();
    if (clash) {
      await args.releaseQuota().catch((e) => console.error(e));
      return {
        ok: false,
        error: "Another live card in this deck already has this content",
      };
    }
  }
  try {
    await db
      .prepare(
        `UPDATE cards
         SET type = ?, front_json = ?, back_json = ?, provenance_json = ?,
             media_r2_keys_json = NULL, content_fp = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        draft.type,
        nextFrontJson,
        nextBackJson,
        nextProvenanceJson,
        regenFp,
        updatedAt,
        cardId,
      )
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|unique|constraint/i.test(message)) {
      await args.releaseQuota().catch((e) => console.error(e));
      return {
        ok: false,
        error: "Another live card in this deck already has this content",
      };
    }
    throw err;
  }

  try {
    await recordRegenUsageEvent(db, {
      userId: args.userId,
      path: args.path,
      provider: args.provider,
      usage,
      createdAt: updatedAt,
    });
  } catch {
    // best-effort metering; card already updated
  }

  return {
    ok: true,
    updatedAt,
    row: {
      ...row,
      type: draft.type,
      front_json: nextFrontJson,
      back_json: nextBackJson,
      provenance_json: nextProvenanceJson,
      media_r2_keys_json: null,
      updated_at: updatedAt,
    },
  };
}

async function markOpFailed(
  db: D1Database,
  opId: string,
  error: string,
): Promise<"failed"> {
  const finishedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE card_regen_ops
       SET status = ?, error = ?, finished_at = ?
       WHERE id = ? AND status IN ('queued', 'running')`,
    )
    .bind("failed", error, finishedAt, opId)
    .run();
  return "failed";
}

async function markOpDone(db: D1Database, opId: string): Promise<"done"> {
  const finishedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE card_regen_ops
       SET status = ?, error = NULL, finished_at = ?
       WHERE id = ?`,
    )
    .bind("done", finishedAt, opId)
    .run();
  return "done";
}

/**
 * Run one card-regen queue message. Quota is reserved here (processor-time),
 * not at HTTP accept, so reconnect polls do not double-reserve.
 */
export async function processCardRegenOp(
  env: Env,
  msg: CardRegenQueueMessage,
): Promise<"done" | "failed" | "busy"> {
  const db = getDb(env);
  const op = await db
    .prepare(
      `SELECT id, card_id, user_id, regen_type, status, error, created_at, finished_at
       FROM card_regen_ops WHERE id = ?`,
    )
    .bind(msg.opId)
    .first<CardRegenOpRow>();
  if (!op) {
    throw new Error(`card_regen_ops row missing: ${msg.opId}`);
  }
  if (op.status === "done") return "done";
  if (op.status === "failed") return "failed";

  await db
    .prepare(
      `UPDATE card_regen_ops SET status = ? WHERE id = ? AND status IN ('queued', 'running')`,
    )
    .bind("running", msg.opId)
    .run();

  let row: CardRow;
  try {
    row = await requireOwnedCard(db, msg.cardId, msg.userId);
  } catch {
    return markOpFailed(db, msg.opId, "Card not found");
  }

  if (row.status !== "draft" && row.status !== "accepted") {
    return markOpFailed(
      db,
      msg.opId,
      "Only draft or accepted cards can be regenerated",
    );
  }

  const materialText = await loadCardSourceText(env, row);
  const excerpt = provenanceExcerptText(
    parseProvenanceJson(row.provenance_json),
  );
  let storedClaim: StudyClaim | null = null;
  const claimId = row.claim_id ?? null;
  if (claimId) {
    const claimRow = await db
      .prepare(
        `SELECT subject, predicate, source_span, object, qualifiers_json, pages_json
         FROM study_claims WHERE id = ? AND deck_id = ?`,
      )
      .bind(claimId, row.deck_id)
      .first<{
        subject: string;
        predicate: string;
        source_span: string;
        object: string | null;
        qualifiers_json: string | null;
        pages_json: string | null;
      }>();
    if (claimRow) {
      storedClaim = studyClaimFromRow(claimRow);
    }
  }
  if (!storedClaim && !materialText && !excerpt) {
    return markOpFailed(
      db,
      msg.opId,
      "No source text available for this card. Edit manually or regenerate from material with text.",
    );
  }

  let llmBundle: Awaited<ReturnType<typeof resolveRegenLlm>>;
  try {
    llmBundle = await resolveRegenLlm(env, msg.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM unavailable";
    return markOpFailed(db, msg.opId, message);
  }

  const since = new Date(Date.now() - STUDY_STRUGGLE_WINDOW_MS).toISOString();
  const [scheduleRow, againRow] = await Promise.all([
    db
      .prepare(`SELECT lapses FROM card_schedules WHERE card_id = ?`)
      .bind(msg.cardId)
      .first<{ lapses: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS again_14d FROM review_logs
         WHERE card_id = ? AND rating = 1 AND reviewed_at >= ?`,
      )
      .bind(msg.cardId, since)
      .first<{ again_14d: number }>(),
  ]);
  const studyStruggle = {
    again_14d: Number(againRow?.again_14d) || 0,
    lapses: Number(scheduleRow?.lapses) || 0,
  };

  const existingFront = parseJsonField<unknown>(row.front_json, null);
  const regenType = msg.type as RegenCardType;
  let generated: Awaited<ReturnType<typeof regenerateClaimAwareCard>>;
  try {
    generated = await regenerateClaimAwareCard({
      excerpt,
      materialText,
      type: regenType,
      existingFront:
        typeof existingFront === "string" ? existingFront : undefined,
      storedClaim,
      studyStruggle,
      llm: llmBundle.llm,
      apiKey: llmBundle.apiKey,
      provider: llmBundle.provider,
    });
  } catch (err) {
    if (err instanceof ClaimAwareRegenError) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
      return markOpFailed(db, msg.opId, err.message);
    }
    if (err instanceof WorkersAiCapacityError) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
    }
    const message =
      err instanceof Error ? err.message : "Card regeneration failed";
    return markOpFailed(db, msg.opId, message);
  }

  const applied = await applyClaimAwareRegenToCard(env, {
    userId: msg.userId,
    cardId: msg.cardId,
    row,
    draft: generated.draft,
    usage: generated.usage,
    path: llmBundle.path,
    provider: llmBundle.provider,
    releaseQuota: llmBundle.releaseQuota,
  });
  if (!applied.ok) {
    return markOpFailed(db, msg.opId, applied.error);
  }
  return markOpDone(db, msg.opId);
}

/**
 * Fail abandoned `running` card regen ops older than the generation stale window.
 * Aligns UI busy state with failStaleRunningJobs timing.
 */
export async function failStaleCardRegenOps(
  env: Env,
  opts?: { nowMs?: number; limit?: number },
): Promise<number> {
  const db = getDb(env);
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = opts?.limit ?? 50;
  const { results } = await db
    .prepare(
      `SELECT id, created_at FROM card_regen_ops
       WHERE status = 'running'
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; created_at: string }>();

  let failed = 0;
  const finishedAt = new Date(nowMs).toISOString();
  for (const row of results ?? []) {
    const createdMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdMs)) continue;
    if (nowMs - createdMs < RUNNING_JOB_STALE_MS) continue;
    const result = await db
      .prepare(
        `UPDATE card_regen_ops
         SET status = ?, error = ?, finished_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind("failed", STALE_CARD_REGEN_FAIL_ERROR, finishedAt, row.id)
      .run();
    if ((result.meta.changes ?? 0) > 0) failed += 1;
  }
  return failed;
}
