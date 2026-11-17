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

type AdminContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

const SOURCE_USER_SQL =
  "SELECT id, email, oauth_subject, created_at, disabled_at, sandbox_of FROM users WHERE id = ?";

function newSandboxUserId(): string {
  return crypto.randomUUID();
}

function sandboxEmail(sourceUserId: string, sandboxUserId: string): string {
  return `sandbox+${sourceUserId.slice(0, 8)}-${sandboxUserId.slice(0, 8)}@sandbox.invalid`;
}

function logImpersonationStarted(meta: {
  actorUserId: string;
  sourceUserId: string;
  sandboxUserId: string;
  startedAt: number;
}) {
  console.log(
    JSON.stringify({
      event: "admin.impersonation_started",
      actorUserId: meta.actorUserId,
      sourceUserId: meta.sourceUserId,
      sandboxUserId: meta.sandboxUserId,
      startedAt: meta.startedAt,
    }),
  );
}

function logImpersonationStopped(meta: {
  actorUserId: string;
  sourceUserId: string;
  sandboxUserId: string;
  startedAt: number;
}) {
  console.log(
    JSON.stringify({
      event: "admin.impersonation_stopped",
      actorUserId: meta.actorUserId,
      sourceUserId: meta.sourceUserId,
      sandboxUserId: meta.sandboxUserId,
      startedAt: meta.startedAt,
      durationMs: Date.now() - meta.startedAt,
    }),
  );
}

/** Delete sandbox user only (no R2 collector, no session rewrite). For logout. */
export async function abandonImpersonationSandbox(
  c: AdminContext,
  record: SessionRecord,
): Promise<void> {
  if (!record.impersonation || !record.actorUserId) return;
  const { sandboxUserId, sourceUserId, startedAt } = record.impersonation;
  if (record.userId !== sandboxUserId) return;
  try {
    await getDb(c.env)
      .prepare("DELETE FROM users WHERE id = ? AND sandbox_of IS NOT NULL")
      .bind(sandboxUserId)
      .run();
  } catch {
    /* best-effort */
  }
  logImpersonationStopped({
    actorUserId: record.actorUserId,
    sourceUserId,
    sandboxUserId,
    startedAt,
  });
}

/** Delete sandbox user (no R2 collector) and restore actor on the same session. */
export async function teardownImpersonationSession(
  c: AdminContext,
  sessionId: string,
  record: SessionRecord,
): Promise<SessionRecord> {
  if (!record.impersonation || !record.actorUserId) return record;

  const { sandboxUserId, sourceUserId, startedAt } = record.impersonation;
  const actorUserId = record.actorUserId;
  if (record.userId !== sandboxUserId) {
    const next: SessionRecord = {
      userId: actorUserId,
      expiresAt: record.expiresAt,
    };
    await writeSessionRecord(c, sessionId, next);
    return next;
  }

  try {
    await getDb(c.env)
      .prepare("DELETE FROM users WHERE id = ? AND sandbox_of IS NOT NULL")
      .bind(sandboxUserId)
      .run();
  } catch {
    /* best-effort; still restore actor */
  }

  const next: SessionRecord = {
    userId: actorUserId,
    expiresAt: record.expiresAt,
  };
  await writeSessionRecord(c, sessionId, next);
  logImpersonationStopped({
    actorUserId,
    sourceUserId,
    sandboxUserId,
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
    throw new HTTPException(400, { message: "Cannot impersonate sandbox user" });
  }
  refuseAllowlistedTarget(source.email, c.env.ADMIN_EMAILS);

  const sandboxUserId = newSandboxUserId();
  const startedAt = Date.now();
  const email = sandboxEmail(sourceUserId, sandboxUserId);
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, oauth_subject, created_at, sandbox_of) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(sandboxUserId, email, null, null, createdAt, sourceUserId)
    .run();

  const meta: ImpersonationMeta = {
    sourceUserId,
    sandboxUserId,
    sourceEmail: source.email,
    startedAt,
  };

  const next: SessionRecord = {
    userId: sandboxUserId,
    expiresAt: session.record.expiresAt,
    actorUserId: actor.userId,
    impersonation: meta,
  };
  try {
    await writeSessionRecord(c, session.id, next);
  } catch (err) {
    try {
      await db
        .prepare("DELETE FROM users WHERE id = ? AND sandbox_of IS NOT NULL")
        .bind(sandboxUserId)
        .run();
    } catch {
      /* compensating delete best-effort */
    }
    throw err;
  }
  logImpersonationStarted({
    actorUserId: actor.userId,
    sourceUserId,
    sandboxUserId,
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
