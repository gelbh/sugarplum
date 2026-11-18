/** Clone a learner's D1 graph into a sandbox user (new ids; keep source R2 keys). */

import type { Env } from "../env";
import { applySandboxKeyPrefix } from "./sandbox-r2";

export type CloneLimits = { maxCards: number };

export class CloneLimitExceededError extends Error {
  readonly cardCount: number;
  readonly maxCards: number;

  constructor(cardCount: number, maxCards: number) {
    super(`Clone exceeds card limit (${cardCount} > ${maxCards})`);
    this.name = "CloneLimitExceededError";
    this.cardCount = cardCount;
    this.maxCards = maxCards;
  }
}

export const DEFAULT_CLONE_MAX_CARDS = 20_000;

const BATCH = 40;

type IdMap = Map<string, string>;

function newId(): string {
  return crypto.randomUUID();
}

function mapId(map: IdMap, oldId: string): string {
  const existing = map.get(oldId);
  if (existing) return existing;
  const id = newId();
  map.set(oldId, id);
  return id;
}

function remapOrNull(
  map: IdMap,
  oldId: string | null | undefined,
): string | null {
  if (oldId == null) return null;
  return map.get(oldId) ?? null;
}

async function runBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  for (let i = 0; i < statements.length; i += BATCH) {
    await db.batch(statements.slice(i, i + BATCH));
  }
}

async function cloneSubjects(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
  subjectMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(sourceUserId)
    .all<{ id: string; title: string; created_at: string }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const id = mapId(subjectMap, row.id);
    stmts.push(
      db
        .prepare(
          "INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(id, sandboxUserId, row.title, row.created_at),
    );
  }
  await runBatches(db, stmts);
}

async function cloneDecks(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
  subjectMap: IdMap,
  deckMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id, title, subject_id, subject_hint, created_at
       FROM decks WHERE user_id = ? ORDER BY created_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      id: string;
      title: string;
      subject_id: string | null;
      subject_hint: string | null;
      created_at: string;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const id = mapId(deckMap, row.id);
    stmts.push(
      db
        .prepare(
          "INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          sandboxUserId,
          row.title,
          row.subject_hint,
          remapOrNull(subjectMap, row.subject_id),
          row.created_at,
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneMaterials(
  db: D1Database,
  sourceUserId: string,
  deckMap: IdMap,
  materialMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status,
              m.created_at, m.content_hash, m.source_role
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ?
       ORDER BY m.created_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      id: string;
      deck_id: string;
      kind: string;
      r2_key: string | null;
      filename: string | null;
      page_count: number | null;
      status: string;
      created_at: string;
      content_hash: string | null;
      source_role: string | null;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const deckId = deckMap.get(row.deck_id);
    if (!deckId) continue;
    const id = mapId(materialMap, row.id);
    stmts.push(
      db
        .prepare(
          "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, content_hash, source_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          deckId,
          row.kind,
          row.r2_key,
          row.filename,
          row.page_count,
          row.status,
          row.created_at,
          row.content_hash ?? null,
          row.source_role ?? "lecture",
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneGenerationJobs(
  db: D1Database,
  sourceUserId: string,
  materialMap: IdMap,
  jobMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json,
              j.created_at, j.finished_at, j.figure_extract_mode, j.topic_hints_json,
              j.avoid_patterns_json, j.run_topic_hints_json, j.atlas_provenance_json
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ?
       ORDER BY j.created_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      id: string;
      material_id: string;
      status: string;
      error: string | null;
      coverage_json: string | null;
      progress_json: string | null;
      created_at: string;
      finished_at: string | null;
      figure_extract_mode: string | null;
      topic_hints_json: string | null;
      avoid_patterns_json: string | null;
      run_topic_hints_json: string | null;
      atlas_provenance_json: string | null;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const materialId = materialMap.get(row.material_id);
    if (!materialId) continue;
    const id = mapId(jobMap, row.id);
    const inFlight = row.status === "queued" || row.status === "running";
    const status = inFlight ? "failed" : row.status;
    const error = inFlight
      ? "Sandbox clone: job was in progress"
      : row.error;
    const finishedAt = inFlight
      ? (row.finished_at ?? row.created_at)
      : row.finished_at;
    const progressJson = inFlight ? null : row.progress_json;
    stmts.push(
      db
        .prepare(
          "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at, figure_extract_mode, topic_hints_json, atlas_provenance_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          materialId,
          status,
          error,
          row.coverage_json,
          row.created_at,
          finishedAt,
          row.figure_extract_mode ?? "fast",
          row.topic_hints_json,
          row.atlas_provenance_json,
        ),
    );
    if (progressJson != null) {
      stmts.push(
        db
          .prepare(
            "UPDATE generation_jobs SET progress_json = ? WHERE id = ?",
          )
          .bind(progressJson, id),
      );
    }
    if (row.avoid_patterns_json != null || row.run_topic_hints_json != null) {
      stmts.push(
        db
          .prepare(
            "UPDATE generation_jobs SET avoid_patterns_json = ?, run_topic_hints_json = ? WHERE id = ?",
          )
          .bind(row.avoid_patterns_json, row.run_topic_hints_json, id),
      );
    }
  }
  await runBatches(db, stmts);
}

async function cloneCards(
  db: D1Database,
  sourceUserId: string,
  deckMap: IdMap,
  jobMap: IdMap,
  cardMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
       ORDER BY c.created_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
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
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const deckId = deckMap.get(row.deck_id);
    if (!deckId) continue;
    const id = mapId(cardMap, row.id);
    stmts.push(
      db
        .prepare(
          `INSERT INTO cards (
            id, deck_id, job_id, type, front_json, back_json,
            media_r2_keys_json, provenance_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          deckId,
          remapOrNull(jobMap, row.job_id),
          row.type,
          row.front_json,
          row.back_json,
          row.media_r2_keys_json,
          row.provenance_json,
          row.status,
          row.created_at,
          row.updated_at,
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneSchedules(
  db: D1Database,
  sourceUserId: string,
  cardMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT s.card_id, s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
              s.learning_steps, s.reps, s.lapses, s.state, s.last_review
       FROM card_schedules s
       INNER JOIN cards c ON c.id = s.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      card_id: string;
      due: string;
      stability: number;
      difficulty: number;
      elapsed_days: number;
      scheduled_days: number;
      learning_steps: number;
      reps: number;
      lapses: number;
      state: number;
      last_review: string | null;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const cardId = cardMap.get(row.card_id);
    if (!cardId) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO card_schedules (
            card_id, due, stability, difficulty, elapsed_days, scheduled_days,
            learning_steps, reps, lapses, state, last_review
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          cardId,
          row.due,
          row.stability,
          row.difficulty,
          row.elapsed_days,
          row.scheduled_days,
          row.learning_steps,
          row.reps,
          row.lapses,
          row.state,
          row.last_review,
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneReviewLogs(
  db: D1Database,
  sourceUserId: string,
  cardMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT rl.id, rl.card_id, rl.rating, rl.scheduled_days, rl.elapsed_days,
              rl.reviewed_at, rl.state_json
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
       ORDER BY rl.reviewed_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      id: string;
      card_id: string;
      rating: number;
      scheduled_days: number;
      elapsed_days: number;
      reviewed_at: string;
      state_json: string;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const cardId = cardMap.get(row.card_id);
    if (!cardId) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO review_logs (
            id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          cardId,
          row.rating,
          row.scheduled_days,
          row.elapsed_days,
          row.reviewed_at,
          row.state_json,
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneStudyPrefs(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT intro_budget, review_budget, r_floor, desired_retention, enable_fuzz,
              enable_load_balance, easy_days_json, fsrs_w_json, fsrs_last_optimized_at,
              fsrs_optimize_pending, updated_at
       FROM user_study_prefs WHERE user_id = ?`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .first<{
      intro_budget: number;
      review_budget: number;
      r_floor: number;
      desired_retention: number;
      enable_fuzz: number;
      enable_load_balance: number;
      easy_days_json: string;
      fsrs_w_json: string | null;
      fsrs_last_optimized_at: string | null;
      fsrs_optimize_pending: number;
      updated_at: string;
    }>();
  if (!row) return;
  await db
    .prepare(
      `INSERT INTO user_study_prefs
         (user_id, intro_budget, review_budget, r_floor, desired_retention, enable_fuzz,
          enable_load_balance, easy_days_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
    )
    .bind(
      sandboxUserId,
      row.intro_budget,
      row.review_budget,
      row.r_floor,
      row.desired_retention,
      row.enable_fuzz,
      row.enable_load_balance,
      row.easy_days_json,
      row.updated_at,
    )
    .run();
  if (
    row.fsrs_w_json != null ||
    row.fsrs_last_optimized_at != null ||
    row.fsrs_optimize_pending
  ) {
    await db
      .prepare(
        `UPDATE user_study_prefs
         SET fsrs_w_json = ?, fsrs_last_optimized_at = ?, fsrs_optimize_pending = ?
         WHERE user_id = ?`.replace(/\s+/g, " "),
      )
      .bind(
        row.fsrs_w_json,
        row.fsrs_last_optimized_at,
        row.fsrs_optimize_pending ?? 0,
        sandboxUserId,
      )
      .run();
  }
}

async function cloneStudyDays(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
): Promise<void> {
  const { results } = await db
    .prepare(
      "SELECT day, intros_used FROM user_study_day WHERE user_id = ? ORDER BY day ASC",
    )
    .bind(sourceUserId)
    .all<{ day: string; intros_used: number }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO user_study_day (user_id, day, intros_used) VALUES (?, ?, ?)",
        )
        .bind(sandboxUserId, row.day, row.intros_used),
    );
  }
  await runBatches(db, stmts);
}

async function cloneShelfCovers(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
  subjectMap: IdMap,
  deckMap: IdMap,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT owner_kind, owner_id, photo_id, image_url, photographer_name,
              photographer_url, photo_html_url, source, r2_key
       FROM shelf_covers WHERE user_id = ?`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .all<{
      owner_kind: string;
      owner_id: string;
      photo_id: string;
      image_url: string;
      photographer_name: string;
      photographer_url: string;
      photo_html_url: string;
      source: string;
      r2_key: string | null;
    }>();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results ?? []) {
    const ownerId =
      row.owner_kind === "subject"
        ? subjectMap.get(row.owner_id)
        : deckMap.get(row.owner_id);
    if (!ownerId) continue;
    stmts.push(
      db
        .prepare(
          "INSERT INTO shelf_covers (user_id, owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url, source, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, owner_kind, owner_id) DO UPDATE SET photo_id = excluded.photo_id, image_url = excluded.image_url, photographer_name = excluded.photographer_name, photographer_url = excluded.photographer_url, photo_html_url = excluded.photo_html_url, source = excluded.source, r2_key = excluded.r2_key",
        )
        .bind(
          sandboxUserId,
          row.owner_kind,
          ownerId,
          row.photo_id,
          row.image_url,
          row.photographer_name,
          row.photographer_url,
          row.photo_html_url,
          row.source,
          row.r2_key,
        ),
    );
  }
  await runBatches(db, stmts);
}

async function cloneGamification(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day, xp_total, level, display_name,
              board_opt_in, updated_at, clear_due_days, clear_due_last_day, catalog_version
       FROM user_gamification WHERE user_id = ?`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .first<{
      streak_current: number;
      streak_best: number;
      streak_day: string | null;
      xp_total: number;
      level: number;
      display_name: string | null;
      board_opt_in: number;
      updated_at: string;
      clear_due_days: number;
      clear_due_last_day: string | null;
      catalog_version: number;
    }>();
  if (row) {
    await db
      .prepare(
        `INSERT INTO user_gamification (
           user_id, streak_current, streak_best, streak_day, xp_total, level,
           display_name, board_opt_in, updated_at, clear_due_days, clear_due_last_day,
           catalog_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
      )
      .bind(
        sandboxUserId,
        row.streak_current,
        row.streak_best,
        row.streak_day,
        row.xp_total,
        row.level,
        row.display_name,
        0,
        row.updated_at,
        row.clear_due_days ?? 0,
        row.clear_due_last_day,
        row.catalog_version ?? 1,
      )
      .run();
  }

  const { results: progress } = await db
    .prepare(
      "SELECT achievement_id, current_value, threshold FROM achievement_progress WHERE user_id = ?",
    )
    .bind(sourceUserId)
    .all<{
      achievement_id: string;
      current_value: number;
      threshold: number;
    }>();
  const progressStmts: D1PreparedStatement[] = [];
  for (const p of progress ?? []) {
    progressStmts.push(
      db
        .prepare(
          "INSERT INTO achievement_progress (user_id, achievement_id, current_value, threshold) VALUES (?, ?, ?, ?)",
        )
        .bind(sandboxUserId, p.achievement_id, p.current_value, p.threshold),
    );
  }
  await runBatches(db, progressStmts);

  const { results: completions } = await db
    .prepare(
      "SELECT achievement_id, completed_at, trigger_event_id, backdated FROM achievement_completions WHERE user_id = ?",
    )
    .bind(sourceUserId)
    .all<{
      achievement_id: string;
      completed_at: string;
      trigger_event_id: string | null;
      backdated: number;
    }>();
  const completionStmts: D1PreparedStatement[] = [];
  for (const c of completions ?? []) {
    completionStmts.push(
      db
        .prepare(
          "INSERT INTO achievement_completions (user_id, achievement_id, completed_at, trigger_event_id, backdated) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          sandboxUserId,
          c.achievement_id,
          c.completed_at,
          c.trigger_event_id,
          c.backdated ?? 0,
        ),
    );
  }
  await runBatches(db, completionStmts);

  const { results: ledger } = await db
    .prepare(
      "SELECT amount, reason, idempotency_key, created_at FROM xp_ledger WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(sourceUserId)
    .all<{
      amount: number;
      reason: string;
      idempotency_key: string;
      created_at: string;
    }>();
  const ledgerStmts: D1PreparedStatement[] = [];
  for (const entry of ledger ?? []) {
    ledgerStmts.push(
      db
        .prepare(
          "INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          newId(),
          sandboxUserId,
          entry.amount,
          entry.reason,
          `sandbox:${entry.idempotency_key}`,
          entry.created_at,
        ),
    );
  }
  await runBatches(db, ledgerStmts);
}

async function cloneAtlases(
  db: D1Database,
  env: Env,
  sourceUserId: string,
  sandboxUserId: string,
  materialMap: IdMap,
): Promise<void> {
  const atlasMap: IdMap = new Map();
  const entryMap: IdMap = new Map();
  const atlasMaterialMap: IdMap = new Map();

  const { results: atlases } = await db
    .prepare(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE user_id = ?",
    )
    .bind(sourceUserId)
    .all<{
      id: string;
      user_id: string;
      template_key: string;
      created_at: string;
    }>();

  for (const atlas of atlases ?? []) {
    const atlasId = mapId(atlasMap, atlas.id);
    await db
      .prepare(
        "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(atlasId, sandboxUserId, atlas.template_key, atlas.created_at)
      .run();

    const { results: packRows } = await db
      .prepare(
        `SELECT id, atlas_id, kind, r2_key, filename, page_count, status,
                created_at, content_hash, source_role
         FROM atlas_materials WHERE atlas_id = ?
         ORDER BY created_at ASC`.replace(/\s+/g, " "),
      )
      .bind(atlas.id)
      .all<{
        id: string;
        atlas_id: string;
        kind: string;
        r2_key: string | null;
        filename: string | null;
        page_count: number | null;
        status: string;
        created_at: string;
        content_hash: string | null;
        source_role: string;
      }>();
    const packStmts: D1PreparedStatement[] = [];
    for (const row of packRows ?? []) {
      const materialId = mapId(atlasMaterialMap, row.id);
      // Never keep the source user's R2 key on the sandbox row: a later
      // delete would target production objects if get() missed a race.
      let r2Key: string | null = null;
      if (row.r2_key) {
        const src = await env.MATERIALS.get(row.r2_key);
        if (src) {
          const ext =
            row.kind === "paste"
              ? "txt"
              : row.kind === "pptx"
                ? "pptx"
                : "pdf";
          r2Key = applySandboxKeyPrefix(
            sandboxUserId,
            `atlas/${atlasId}/${materialId}.${ext}`,
          );
          await env.MATERIALS.put(r2Key, await src.arrayBuffer(), {
            httpMetadata: src.httpMetadata,
          });
        }
      }
      if (row.kind === "pdf") {
        const ocrKey = `atlas/${atlas.id}/ocr/${row.id}.json`;
        const ocrObj = await env.MATERIALS.get(ocrKey);
        if (ocrObj) {
          const destOcr = applySandboxKeyPrefix(
            sandboxUserId,
            `atlas/${atlasId}/ocr/${materialId}.json`,
          );
          await env.MATERIALS.put(destOcr, await ocrObj.arrayBuffer(), {
            httpMetadata: ocrObj.httpMetadata,
          });
        }
      }
      packStmts.push(
        db
          .prepare(
            `INSERT INTO atlas_materials (
               id, atlas_id, kind, r2_key, filename, page_count, status,
               created_at, content_hash, source_role
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
          )
          .bind(
            materialId,
            atlasId,
            row.kind,
            r2Key,
            row.filename,
            row.page_count,
            row.status,
            row.created_at,
            row.content_hash,
            row.source_role,
          ),
      );
    }
    await runBatches(db, packStmts);

    const { results: entries } = await db
      .prepare(
        `SELECT id, atlas_id, canonical_name, common_name, fields_json, status,
                created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
         FROM atlas_entries WHERE atlas_id = ?`.replace(/\s+/g, " "),
      )
      .bind(atlas.id)
      .all<{
        id: string;
        atlas_id: string;
        canonical_name: string;
        common_name: string | null;
        fields_json: string;
        status: string;
        created_at: string;
        updated_at: string;
        origin_key: string | null;
        origin_version: number | null;
        edited_at: string | null;
        deleted_at: string | null;
      }>();

    for (const entry of entries ?? []) {
      const entryId = mapId(entryMap, entry.id);
      await db
        .prepare(
          `INSERT INTO atlas_entries (
             id, atlas_id, canonical_name, common_name, fields_json, status,
             created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
        )
        .bind(
          entryId,
          atlasId,
          entry.canonical_name,
          entry.common_name,
          entry.fields_json,
          entry.status,
          entry.created_at,
          entry.updated_at,
          entry.origin_key,
          entry.origin_version,
          entry.edited_at,
          entry.deleted_at,
        )
        .run();
    }

    const { results: refs } = await db
      .prepare(
        `SELECT r.id, r.entry_id, r.field_key, r.citation, r.url, r.material_id, r.page,
                r.note, r.user_added, r.created_at
         FROM atlas_entry_refs r
         INNER JOIN atlas_entries e ON e.id = r.entry_id
         WHERE e.atlas_id = ?`.replace(/\s+/g, " "),
      )
      .bind(atlas.id)
      .all<{
        id: string;
        entry_id: string;
        field_key: string | null;
        citation: string;
        url: string | null;
        material_id: string | null;
        page: number | null;
        note: string | null;
        user_added: number;
        created_at: string;
      }>();
    const refStmts: D1PreparedStatement[] = [];
    for (const ref of refs ?? []) {
      const entryId = entryMap.get(ref.entry_id);
      if (!entryId) continue;
      refStmts.push(
        db
          .prepare(
            `INSERT INTO atlas_entry_refs (
               id, entry_id, field_key, citation, url, material_id, page, note,
               user_added, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
          )
          .bind(
            newId(),
            entryId,
            ref.field_key,
            ref.citation,
            ref.url,
            remapOrNull(materialMap, ref.material_id),
            ref.page,
            ref.note,
            ref.user_added ?? 0,
            ref.created_at,
          ),
      );
    }
    await runBatches(db, refStmts);

    const { results: images } = await db
      .prepare(
        `SELECT i.id, i.entry_id, i.src, i.role, i.caption, i.credit, i.license,
                i.source_url, i.is_hero, i.user_added, i.deleted_at, i.created_at
         FROM atlas_entry_images i
         INNER JOIN atlas_entries e ON e.id = i.entry_id
         WHERE e.atlas_id = ?`.replace(/\s+/g, " "),
      )
      .bind(atlas.id)
      .all<{
        id: string;
        entry_id: string;
        src: string;
        role: string | null;
        caption: string | null;
        credit: string | null;
        license: string | null;
        source_url: string | null;
        is_hero: number;
        user_added: number;
        deleted_at: string | null;
        created_at: string;
      }>();
    const imageStmts: D1PreparedStatement[] = [];
    for (const image of images ?? []) {
      const entryId = entryMap.get(image.entry_id);
      if (!entryId) continue;
      imageStmts.push(
        db
          .prepare(
            `INSERT INTO atlas_entry_images (
               id, entry_id, src, role, caption, credit, license, source_url,
               is_hero, user_added, deleted_at, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
          )
          .bind(
            newId(),
            entryId,
            image.src,
            image.role,
            image.caption,
            image.credit,
            image.license,
            image.source_url,
            image.is_hero ?? 0,
            image.user_added ?? 0,
            image.deleted_at,
            image.created_at,
          ),
      );
    }
    await runBatches(db, imageStmts);

    const { results: focusRows } = await db
      .prepare(
        "SELECT atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at FROM atlas_entry_focus WHERE atlas_id = ?",
      )
      .bind(atlas.id)
      .all<{
        atlas_id: string;
        entry_key: string;
        tier: string;
        reason: string;
        material_ids_json: string;
        override: string | null;
        updated_at: string;
      }>();
    const focusStmts: D1PreparedStatement[] = [];
    for (const focus of focusRows ?? []) {
      let materialIdsJson = focus.material_ids_json;
      try {
        const parsed = JSON.parse(focus.material_ids_json) as unknown;
        if (Array.isArray(parsed)) {
          materialIdsJson = JSON.stringify(
            parsed.map((id) => {
              if (typeof id !== "string") return id;
              return (
                atlasMaterialMap.get(id) ?? materialMap.get(id) ?? id
              );
            }),
          );
        }
      } catch {
        /* keep original */
      }
      const entryKey = entryMap.get(focus.entry_key) ?? focus.entry_key;
      focusStmts.push(
        db
          .prepare(
            `INSERT INTO atlas_entry_focus (
               atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
          )
          .bind(
            atlasId,
            entryKey,
            focus.tier,
            focus.reason,
            materialIdsJson,
            focus.override,
            focus.updated_at,
          ),
      );
    }
    await runBatches(db, focusStmts);
  }
}

async function cloneCalendarLinks(
  db: D1Database,
  sourceUserId: string,
  sandboxUserId: string,
  subjectMap: IdMap,
): Promise<void> {
  // Skip calendar_connections (OAuth refresh ciphertext). Clone UI-facing links/dismissals only.
  const { results: links } = await db
    .prepare(
      "SELECT cluster_key, subject_id, created_at FROM calendar_subject_links WHERE user_id = ?",
    )
    .bind(sourceUserId)
    .all<{ cluster_key: string; subject_id: string; created_at: string }>();
  const linkStmts: D1PreparedStatement[] = [];
  for (const link of links ?? []) {
    const subjectId = subjectMap.get(link.subject_id);
    if (!subjectId) continue;
    linkStmts.push(
      db
        .prepare(
          "INSERT INTO calendar_subject_links (user_id, cluster_key, subject_id, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(sandboxUserId, link.cluster_key, subjectId, link.created_at),
    );
  }
  await runBatches(db, linkStmts);

  const { results: dismissals } = await db
    .prepare(
      "SELECT cluster_key, created_at FROM calendar_dismissals WHERE user_id = ?",
    )
    .bind(sourceUserId)
    .all<{ cluster_key: string; created_at: string }>();
  const dismissalStmts: D1PreparedStatement[] = [];
  for (const row of dismissals ?? []) {
    dismissalStmts.push(
      db
        .prepare(
          "INSERT INTO calendar_dismissals (user_id, cluster_key, created_at) VALUES (?, ?, ?)",
        )
        .bind(sandboxUserId, row.cluster_key, row.created_at),
    );
  }
  await runBatches(db, dismissalStmts);
}

/**
 * Clone learner-owned D1 rows from sourceUserId into sandboxUserId.
 * Skips user_secrets, usage_events, export_jobs, free_gen_usage, calendar_connections.
 * Keeps material/card R2 keys pointing at source objects (read-through).
 */
export async function cloneUserGraph(
  db: D1Database,
  env: Env,
  sourceUserId: string,
  sandboxUserId: string,
  limits?: CloneLimits,
): Promise<{ cardCount: number }> {
  const maxCards = limits?.maxCards ?? DEFAULT_CLONE_MAX_CARDS;
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`.replace(/\s+/g, " "),
    )
    .bind(sourceUserId)
    .first<{ cnt: number }>();
  const cardCount = Number(countRow?.cnt ?? 0);
  if (cardCount > maxCards) {
    throw new CloneLimitExceededError(cardCount, maxCards);
  }

  const subjectMap: IdMap = new Map();
  const deckMap: IdMap = new Map();
  const materialMap: IdMap = new Map();
  const jobMap: IdMap = new Map();
  const cardMap: IdMap = new Map();

  await cloneSubjects(db, sourceUserId, sandboxUserId, subjectMap);
  await cloneDecks(db, sourceUserId, sandboxUserId, subjectMap, deckMap);
  await cloneMaterials(db, sourceUserId, deckMap, materialMap);
  await cloneGenerationJobs(db, sourceUserId, materialMap, jobMap);
  await cloneCards(db, sourceUserId, deckMap, jobMap, cardMap);
  await cloneSchedules(db, sourceUserId, cardMap);
  await cloneReviewLogs(db, sourceUserId, cardMap);
  await cloneStudyPrefs(db, sourceUserId, sandboxUserId);
  await cloneStudyDays(db, sourceUserId, sandboxUserId);
  await cloneShelfCovers(
    db,
    sourceUserId,
    sandboxUserId,
    subjectMap,
    deckMap,
  );
  await cloneGamification(db, sourceUserId, sandboxUserId);
  await cloneAtlases(db, env, sourceUserId, sandboxUserId, materialMap);
  await cloneCalendarLinks(db, sourceUserId, sandboxUserId, subjectMap);

  return { cardCount };
}
