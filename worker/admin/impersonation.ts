import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import {
  IMPERSONATION_TTL_SECONDS,
  readSessionRecord,
  writeSessionRecord,
  type AuthVariables,
  type ImpersonationMeta,
  type SessionRecord,
} from "../auth/session";
import { getDb } from "../db/client";
import { requireAdmin } from "./requireAdmin";
import { refuseAllowlistedTarget } from "./wipe";
import type { AdminUserRow } from "./types";
import { throwViewAsReadOnly } from "./viewAsReadOnly";

type AdminContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

const SOURCE_USER_SQL =
  "SELECT id, email, oauth_subject, created_at, disabled_at, sandbox_of FROM users WHERE id = ?";

function logImpersonationStarted(meta: {
  actorUserId: string;
  sourceUserId: string;
  startedAt: number;
}) {
  console.log(
    JSON.stringify({
      event: "admin.impersonation_started",
      actorUserId: meta.actorUserId,
      sourceUserId: meta.sourceUserId,
      startedAt: meta.startedAt,
    }),
  );
}

function logImpersonationStopped(meta: {
  actorUserId: string;
  sourceUserId: string;
  startedAt: number;
}) {
  console.log(
    JSON.stringify({
      event: "admin.impersonation_stopped",
      actorUserId: meta.actorUserId,
      sourceUserId: meta.sourceUserId,
      startedAt: meta.startedAt,
      durationMs: Date.now() - meta.startedAt,
    }),
  );
}

/** Clear view-as metadata for logout (session delete follows). No D1/R2 teardown. */
export async function abandonViewAs(record: SessionRecord): Promise<void> {
  if (!record.impersonation || !record.actorUserId) return;
  const { sourceUserId, startedAt } = record.impersonation;
  logImpersonationStopped({
    actorUserId: record.actorUserId,
    sourceUserId,
    startedAt,
  });
}

/** Restore actor on the same session. No D1/R2 teardown. */
export async function teardownImpersonationSession(
  c: AdminContext,
  sessionId: string,
  record: SessionRecord,
): Promise<SessionRecord> {
  if (!record.impersonation || !record.actorUserId) return record;

  const { sourceUserId, startedAt } = record.impersonation;
  const actorUserId = record.actorUserId;
  const next: SessionRecord = {
    userId: actorUserId,
    expiresAt: record.expiresAt,
  };
  await writeSessionRecord(c, sessionId, next);
  logImpersonationStopped({
    actorUserId,
    sourceUserId,
    startedAt,
  });
  return next;
}

/** 403 when the session is mid-impersonation (account-security mutates). */
export async function assertNotImpersonating(c: AdminContext): Promise<void> {
  const session = await readSessionRecord(c);
  if (session?.record.impersonation) {
    throw new HTTPException(403, {
      message: "Unavailable during impersonation",
    });
  }
}

/** 403 for view-as (prefer `viewingAs` after requireUser; else fresh KV). */
export async function rejectIfViewingAs(c: AdminContext): Promise<void> {
  if (c.get("viewingAs")) {
    throwViewAsReadOnly();
  }
  const { readSessionRecordFresh } = await import("../auth/session");
  const session = await readSessionRecordFresh(c);
  if (session?.record.impersonation) {
    throwViewAsReadOnly();
  }
}

/** Exact GET paths that mutate identity / schedules / OAuth while view-as. */
export const VIEW_AS_BLOCKED_GET_EXACT = [
  "/api/calendar/connect",
  "/api/calendar/callback",
  "/api/settings/study/fsrs-optimize",
] as const;

/** Path prefixes blocked for GET while view-as. */
export const VIEW_AS_BLOCKED_GET_PREFIXES = ["/api/auth/google"] as const;

export function isViewAsBlockedGetPath(path: string): boolean {
  if (VIEW_AS_BLOCKED_GET_PREFIXES.some((p) => path.startsWith(p))) return true;
  return (VIEW_AS_BLOCKED_GET_EXACT as readonly string[]).includes(path);
}

export async function startImpersonation(
  c: AdminContext,
  sourceUserId: string,
): Promise<ImpersonationMeta> {
  const actor = await requireAdmin(c);
  const session = await readSessionRecord(c);
  if (!session) throw new HTTPException(401, { message: "Unauthorized" });
  if (session.record.impersonation) {
    throw new HTTPException(400, {
      message: "Already impersonating; exit first",
    });
  }
  if (sourceUserId === actor.userId) {
    throw new HTTPException(400, { message: "Cannot impersonate yourself" });
  }

  const db = getDb(c.env);
  const source = await db
    .prepare(SOURCE_USER_SQL)
    .bind(sourceUserId)
    .first<AdminUserRow>();
  if (!source) throw new HTTPException(404, { message: "User not found" });
  if (source.sandbox_of != null) {
    throw new HTTPException(400, {
      message: "Cannot impersonate sandbox user",
    });
  }
  refuseAllowlistedTarget(source.email, c.env.ADMIN_EMAILS);

  const startedAt = Date.now();
  const meta: ImpersonationMeta = {
    sourceUserId,
    sourceEmail: source.email,
    startedAt,
  };

  const next: SessionRecord = {
    userId: sourceUserId,
    expiresAt: session.record.expiresAt,
    actorUserId: actor.userId,
    impersonation: meta,
  };
  await writeSessionRecord(c, session.id, next);
  logImpersonationStarted({
    actorUserId: actor.userId,
    sourceUserId,
    startedAt,
  });
  return meta;
}

export async function exitImpersonation(c: AdminContext): Promise<void> {
  await requireAdmin(c);
  const session = await readSessionRecord(c);
  if (!session?.record.impersonation || !session.record.actorUserId) {
    throw new HTTPException(400, { message: "Not impersonating" });
  }
  await teardownImpersonationSession(c, session.id, session.record);
}

export function impersonationExpiresAt(startedAt: number): number {
  return startedAt + IMPERSONATION_TTL_SECONDS * 1000;
}
