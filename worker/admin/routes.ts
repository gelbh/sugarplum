import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { getFreeGenUsage } from "../generation/quota";
import {
  backfillUsageEventsFromJobs,
  usageFieldsFromProgress,
} from "../generation/usage";
import { requireAdmin } from "./requireAdmin";
import { runProvenanceBackfill } from "./provenance-backfill";
import { runHealWipedFields } from "../atlas/heal-wiped-fields";
import type { AppEnv, AdminUserDetail, AdminUserListItem } from "./types";
import {
  collectUserR2Keys,
  loadAdminUser,
  refuseAllowlistedTarget,
  refuseSandboxTarget,
} from "./wipe";
import { exitImpersonation, startImpersonation } from "./impersonation";
import { EXPORT_MAX_CHARS, buildUserExportPayload } from "./export";
import {
  LIST_USERS_SQL,
  USER_DETAIL_SQL,
  RECENT_JOBS_SQL,
  RECENT_STUDY_DAYS_SQL,
  SUBJECTS_SQL,
  DECKS_SQL,
  MATERIALS_SQL,
  STUDY_PREFS_SQL,
  CARD_SAMPLE_SQL,
  USER_USAGE_SQL,
  parseUserListLimit,
  createdLast7dCutoffIso,
  usage30dCutoffIso,
  frontPreviewFromJson,
} from "./queries";

export type {
  AdminUserListItem,
  AdminUsageSummary,
  AdminUserDetail,
} from "./types";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/overview", async (c) => {
  await requireAdmin(c);
  const cutoff7 = createdLast7dCutoffIso();
  const cutoff30 = usage30dCutoffIso();
  const row = await getDb(c.env)
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE sandbox_of IS NULL) AS user_count,
        (SELECT COUNT(*) FROM users WHERE sandbox_of IS NULL AND created_at >= ?) AS created_last_7d,
        (SELECT COALESCE(SUM(COALESCE(tokens_total, 0)), 0) FROM usage_events) AS tokens_all_time,
        (SELECT COALESCE(SUM(COALESCE(tokens_total, 0)), 0) FROM usage_events
           WHERE created_at >= ?) AS tokens_30d,
        (SELECT COUNT(*) FROM usage_events
           WHERE created_at >= ? AND path = 'free'
             AND kind = 'generation') AS free_jobs_30d,
        (SELECT COUNT(*) FROM usage_events
           WHERE created_at >= ? AND path = 'byo'
             AND kind = 'generation') AS byo_jobs_30d`,
    )
    .bind(cutoff7, cutoff30, cutoff30, cutoff30)
    .first<{
      user_count: number;
      created_last_7d: number;
      tokens_all_time: number;
      tokens_30d: number;
      free_jobs_30d: number;
      byo_jobs_30d: number;
    }>();
  return c.json({
    userCount: row?.user_count ?? 0,
    createdLast7d: row?.created_last_7d ?? 0,
    tokensAllTime: row?.tokens_all_time ?? 0,
    tokens30d: row?.tokens_30d ?? 0,
    freeJobs30d: row?.free_jobs_30d ?? 0,
    byoJobs30d: row?.byo_jobs_30d ?? 0,
  });
});

adminRoutes.get("/users", async (c) => {
  await requireAdmin(c);
  const q = c.req.query("q") ?? "";
  const limit = parseUserListLimit(c.req.query("limit"));
  const cutoff30 = usage30dCutoffIso();
  const { results } = await getDb(c.env)
    .prepare(LIST_USERS_SQL)
    .bind(cutoff30, q, q, limit)
    .all<{
      id: string;
      email: string;
      created_at: string;
      oauth_subject: string | null;
      disabled_at: string | null;
      deck_count: number;
      card_count: number;
      job_count: number;
      tokens_30d: number;
    }>();

  const users: AdminUserListItem[] = (results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    disabled_at: row.disabled_at ?? null,
    deckCount: row.deck_count,
    cardCount: row.card_count,
    jobCount: row.job_count,
    tokens30d: row.tokens_30d ?? 0,
  }));
  return c.json({ users });
});

adminRoutes.post("/usage/backfill", async (c) => {
  await requireAdmin(c);
  const inserted = await backfillUsageEventsFromJobs(getDb(c.env));
  return c.json({ inserted });
});

adminRoutes.post("/provenance/backfill", async (c) => {
  await requireAdmin(c);
  const raw = await c.req.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const record = body as { dry_run?: unknown; limit?: unknown };
  // Default dry_run; require explicit dry_run:false to mutate.
  const dry_run = record.dry_run !== false;
  const limit =
    typeof record.limit === "number" && Number.isInteger(record.limit)
      ? record.limit
      : undefined;
  const result = await runProvenanceBackfill(c.env, { dry_run, limit });
  return c.json(result);
});

adminRoutes.post("/atlas/heal-wiped-fields", async (c) => {
  await requireAdmin(c);
  const raw = await c.req.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const record = body as {
    dry_run?: unknown;
    userId?: unknown;
    atlasId?: unknown;
  };
  const dry_run = record.dry_run !== false;
  const userId =
    typeof record.userId === "string" ? record.userId : undefined;
  const atlasId =
    typeof record.atlasId === "string" ? record.atlasId : undefined;
  // Mutate requires a scope filter so dry_run:false cannot rewrite every overlay.
  if (!dry_run && !userId && !atlasId) {
    throw new HTTPException(400, {
      message: "userId or atlasId required when dry_run is false",
    });
  }
  const result = await runHealWipedFields(getDb(c.env), {
    dry_run,
    userId,
    atlasId,
  });
  return c.json(result);
});

adminRoutes.get("/users/:id", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const cutoff30 = usage30dCutoffIso();
  const row = await db.prepare(USER_DETAIL_SQL).bind(id).first<{
    id: string;
    email: string;
    created_at: string;
    oauth_subject: string | null;
    disabled_at: string | null;
    deck_count: number;
    card_count: number;
    job_count: number;
    material_count: number;
  }>();
  if (!row) throw new HTTPException(404, { message: "User not found" });

  const [
    { results: jobRows },
    { results: studyRows },
    { results: subjectRows },
    { results: deckRows },
    { results: materialRows },
    prefsRow,
    usageRow,
    { results: cardRows },
    freeGenToday,
  ] = await Promise.all([
    db.prepare(RECENT_JOBS_SQL).bind(id, 20).all<{
      id: string;
      status: string;
      created_at: string;
      finished_at: string | null;
      progress_json: string | null;
    }>(),
    db
      .prepare(RECENT_STUDY_DAYS_SQL)
      .bind(id, 14)
      .all<{ day: string; intros_used: number }>(),
    db
      .prepare(SUBJECTS_SQL)
      .bind(id)
      .all<{ id: string; title: string; created_at: string }>(),
    db.prepare(DECKS_SQL).bind(id).all<{
      id: string;
      title: string;
      subject_id: string | null;
      created_at: string;
    }>(),
    db.prepare(MATERIALS_SQL).bind(id).all<{
      id: string;
      deck_id: string;
      kind: string;
      filename: string | null;
      status: string;
      created_at: string;
    }>(),
    db.prepare(STUDY_PREFS_SQL).bind(id).first<{
      intro_budget: number;
      review_budget: number;
      r_floor: number;
      updated_at: string;
    }>(),
    db
      .prepare(USER_USAGE_SQL)
      .bind(id, id, cutoff30, id, cutoff30, id, cutoff30)
      .first<{
        tokens_all_time: number;
        tokens_30d: number;
        free_jobs_30d: number;
        byo_jobs_30d: number;
      }>(),
    db.prepare(CARD_SAMPLE_SQL).bind(id).all<{
      id: string;
      type: string;
      status: string;
      front_json: string;
    }>(),
    getFreeGenUsage(c.env, id).catch(() => null),
  ]);

  const recentJobs = (jobRows ?? []).map((job) => {
    const fields = usageFieldsFromProgress(job.progress_json);
    return {
      id: job.id,
      status: job.status,
      created_at: job.created_at,
      finished_at: job.finished_at ?? null,
      ...(fields.tokens_total != null
        ? { tokens_used: fields.tokens_total }
        : {}),
      ...(fields.tokens_prompt != null
        ? { tokens_prompt: fields.tokens_prompt }
        : {}),
      ...(fields.tokens_completion != null
        ? { tokens_completion: fields.tokens_completion }
        : {}),
      ...(fields.path ? { path: fields.path } : {}),
    };
  });

  const detail: AdminUserDetail = {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    disabled_at: row.disabled_at ?? null,
    counts: {
      decks: row.deck_count,
      cards: row.card_count,
      jobs: row.job_count,
      materials: row.material_count,
    },
    recentJobs,
    recentStudyDays: studyRows ?? [],
    subjects: subjectRows ?? [],
    decks: deckRows ?? [],
    materials: materialRows ?? [],
    studyPrefs: prefsRow ?? null,
    freeGenToday,
    usage: {
      tokensAllTime: usageRow?.tokens_all_time ?? 0,
      tokens30d: usageRow?.tokens_30d ?? 0,
      freeJobs30d: usageRow?.free_jobs_30d ?? 0,
      byoJobs30d: usageRow?.byo_jobs_30d ?? 0,
    },
    cardSample: (cardRows ?? []).map((card) => ({
      id: card.id,
      type: card.type,
      status: card.status,
      frontPreview: frontPreviewFromJson(card.front_json),
    })),
  };
  return c.json(detail);
});

adminRoutes.post("/users/:id/impersonate", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const impersonation = await startImpersonation(c, id);
  return c.json({ ok: true, impersonation });
});

adminRoutes.post("/impersonation/exit", async (c) => {
  await requireAdmin(c);
  await exitImpersonation(c);
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/disable", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseSandboxTarget(user);
  refuseAllowlistedTarget(user.email, c.env.ADMIN_EMAILS);
  const disabledAt = new Date().toISOString();
  await db
    .prepare("UPDATE users SET disabled_at = ? WHERE id = ?")
    .bind(disabledAt, id)
    .run();
  return c.json({ id, disabled_at: disabledAt });
});

adminRoutes.post("/users/:id/enable", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseSandboxTarget(user);
  await db
    .prepare("UPDATE users SET disabled_at = ? WHERE id = ?")
    .bind(null, id)
    .run();
  return c.json({ id, disabled_at: null });
});

adminRoutes.post("/users/:id/wipe", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const confirmEmail =
    body &&
    typeof body === "object" &&
    "confirmEmail" in body &&
    typeof (body as { confirmEmail: unknown }).confirmEmail === "string"
      ? (body as { confirmEmail: string }).confirmEmail
      : "";
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseSandboxTarget(user);
  refuseAllowlistedTarget(user.email, c.env.ADMIN_EMAILS);
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new HTTPException(400, { message: "confirmEmail mismatch" });
  }
  const r2Keys = await collectUserR2Keys(db, c.env.MATERIALS, id);
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  for (const key of r2Keys) {
    try {
      await c.env.MATERIALS.delete(key);
    } catch {
      /* best-effort; user row already gone */
    }
  }
  return c.json({ ok: true });
});

adminRoutes.get("/users/:id/export", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseSandboxTarget(user);

  const payload = await buildUserExportPayload(c.env, db, user);

  const serialized = JSON.stringify(payload);
  if (serialized.length > EXPORT_MAX_CHARS) {
    throw new HTTPException(413, { message: "Export too large" });
  }

  return new Response(serialized, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="user-${id}-export.json"`,
    },
  });
});
