import { composeSubjectKnowledge } from "../../src/study/queue/subjectKnowledge";

export type KnowledgeSummaryRow = {
  subject_id: string;
  user_id: string;
  new_count: number;
  learning_count: number;
  young_count: number;
  mature_count: number;
  recall_card_count: number;
  r_sum: number;
  updated_at: string;
};

export type CompositionSummaryJson = {
  subjectId: string;
  total: number;
  graduatedPct: number | null;
  new: number;
  learning: number;
  young: number;
  mature: number;
  avgRetrievability: number | null;
  etk: number;
  recallCardCount: number;
};

const SUMMARY_ROWS_SQL = `-- sugarplum:subject-knowledge-summary-rows
SELECT s.state AS state,
       s.scheduled_days AS scheduled_days,
       s.due AS due,
       s.stability AS stability,
       s.difficulty AS difficulty,
       s.elapsed_days AS elapsed_days,
       s.learning_steps AS learning_steps,
       s.reps AS reps,
       s.lapses AS lapses,
       s.last_review AS last_review
FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
LEFT JOIN card_schedules s ON s.card_id = c.id
WHERE d.user_id = ? AND d.subject_id = ? AND c.status = 'accepted'`;

const CARD_SUBJECT_SQL = `-- sugarplum:subject-knowledge-card-subject
SELECT d.subject_id AS subject_id
FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE c.id = ? AND d.user_id = ?`;

const UPSERT_SQL = `INSERT INTO subject_knowledge_summaries (
  subject_id, user_id, new_count, learning_count, young_count, mature_count,
  recall_card_count, r_sum, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(subject_id) DO UPDATE SET
  user_id = excluded.user_id,
  new_count = excluded.new_count,
  learning_count = excluded.learning_count,
  young_count = excluded.young_count,
  mature_count = excluded.mature_count,
  recall_card_count = excluded.recall_card_count,
  r_sum = excluded.r_sum,
  updated_at = excluded.updated_at`;

type ScheduleRow = {
  state: number | null;
  scheduled_days: number | null;
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  last_review: string | null;
};

export function compositionJsonFromSummary(
  row: KnowledgeSummaryRow,
): CompositionSummaryJson {
  const total =
    row.new_count +
    row.learning_count +
    row.young_count +
    row.mature_count;
  const graduated = row.young_count + row.mature_count;
  return {
    subjectId: row.subject_id,
    total,
    graduatedPct: total === 0 ? null : Math.round((100 * graduated) / total),
    new: row.new_count,
    learning: row.learning_count,
    young: row.young_count,
    mature: row.mature_count,
    avgRetrievability:
      row.recall_card_count > 0 ? row.r_sum / row.recall_card_count : null,
    etk: row.r_sum,
    recallCardCount: row.recall_card_count,
  };
}

export async function listKnowledgeSummariesForUser(
  db: D1Database,
  userId: string,
): Promise<KnowledgeSummaryRow[]> {
  const { results } = await db
    .prepare(
      `-- sugarplum:subject-knowledge-summaries-list
       SELECT subject_id, user_id, new_count, learning_count, young_count,
              mature_count, recall_card_count, r_sum, updated_at
       FROM subject_knowledge_summaries
       WHERE user_id = ?`,
    )
    .bind(userId)
    .all<KnowledgeSummaryRow>();
  return results ?? [];
}

export async function upsertKnowledgeSummary(
  db: D1Database,
  row: KnowledgeSummaryRow,
): Promise<void> {
  await db
    .prepare(UPSERT_SQL)
    .bind(
      row.subject_id,
      row.user_id,
      row.new_count,
      row.learning_count,
      row.young_count,
      row.mature_count,
      row.recall_card_count,
      row.r_sum,
      row.updated_at,
    )
    .run();
}

export async function recomputeSubjectKnowledgeSummary(
  db: D1Database,
  userId: string,
  subjectId: string,
  now: Date = new Date(),
): Promise<KnowledgeSummaryRow> {
  const { results } = await db
    .prepare(SUMMARY_ROWS_SQL)
    .bind(userId, subjectId)
    .all<ScheduleRow>();
  const knowledge = composeSubjectKnowledge(results ?? [], now);
  const row: KnowledgeSummaryRow = {
    subject_id: subjectId,
    user_id: userId,
    new_count: knowledge.new,
    learning_count: knowledge.learning,
    young_count: knowledge.young,
    mature_count: knowledge.mature,
    recall_card_count: knowledge.recallCardCount,
    r_sum: knowledge.etk,
    updated_at: now.toISOString(),
  };
  await upsertKnowledgeSummary(db, row);
  return row;
}

export async function subjectIdForOwnedCard(
  db: D1Database,
  userId: string,
  cardId: string,
): Promise<string | null> {
  const row = await db
    .prepare(CARD_SUBJECT_SQL)
    .bind(cardId, userId)
    .first<{ subject_id: string | null }>();
  return row?.subject_id ?? null;
}

export async function refreshKnowledgeSummaryForOwnedCard(
  db: D1Database,
  userId: string,
  cardId: string,
  now: Date = new Date(),
): Promise<void> {
  const subjectId = await subjectIdForOwnedCard(db, userId, cardId);
  if (subjectId == null) return;
  await recomputeSubjectKnowledgeSummary(db, userId, subjectId, now);
}

export async function refreshKnowledgeSummaryForSubject(
  db: D1Database,
  userId: string,
  subjectId: string | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (subjectId == null) return;
  await recomputeSubjectKnowledgeSummary(db, userId, subjectId, now);
}

export async function refreshKnowledgeSummariesForOwnedCards(
  db: D1Database,
  userId: string,
  cardIds: string[],
  now: Date = new Date(),
): Promise<void> {
  const seen = new Set<string>();
  for (const cardId of cardIds) {
    const row = await db
      .prepare(CARD_SUBJECT_SQL)
      .bind(cardId, userId)
      .first<{ subject_id: string | null }>();
    if (row?.subject_id == null || seen.has(row.subject_id)) continue;
    seen.add(row.subject_id);
    await recomputeSubjectKnowledgeSummary(db, userId, row.subject_id, now);
  }
}
