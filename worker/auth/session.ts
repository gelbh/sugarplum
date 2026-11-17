import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";

export const SESSION_COOKIE = "sp_session";
/** 30 days in seconds */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Absolute impersonation window from startedAt (independent of cookie TTL). */
export const IMPERSONATION_TTL_SECONDS = 60 * 60;

export type ImpersonationMeta = {
  sourceUserId: string;
  sandboxUserId: string;
  sourceEmail: string;
  startedAt: number;
};

export type SessionRecord = {
  userId: string;
  expiresAt: number;
  actorUserId?: string;
  impersonation?: ImpersonationMeta;
};

export type AuthVariables = {
  userId: string;
};

type AuthContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

function randomSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Secure cookies only on https so http://localhost can set the session. */
export function sessionCookieSecure(url: string | URL): boolean {
  const protocol = typeof url === "string" ? new URL(url).protocol : url.protocol;
  return protocol === "https:";
}

function sessionCookieAttrs(c: AuthContext) {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(c.req.url),
    sameSite: "Lax" as const,
    path: "/",
  };
}

/** Create a KV session and set the HttpOnly SameSite=Lax cookie (Secure on https). */
export async function createSession(
  c: AuthContext,
  userId: string,
): Promise<string> {
  const id = randomSessionId();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const record: SessionRecord = { userId, expiresAt };
  await c.env.SESSIONS.put(id, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  setCookie(c, SESSION_COOKIE, id, {
    ...sessionCookieAttrs(c),
    maxAge: SESSION_TTL_SECONDS,
  });
  return id;
}

/** Delete the session from KV and clear the cookie. */
export async function destroySession(c: AuthContext): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.env.SESSIONS.delete(id);
  deleteCookie(c, SESSION_COOKIE, sessionCookieAttrs(c));
}

/** Read the current cookie session record from KV (no throw). */
export async function readSessionRecord(c: AuthContext): Promise<{
  id: string;
  record: SessionRecord;
} | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const raw = await c.env.SESSIONS.get(id);
  if (!raw) return null;
  const record = parseSessionRecord(raw);
  if (!record || !isSessionActive(record)) return null;
  return { id, record };
}

/** Rewrite a session record in KV, preserving expiresAt via remaining TTL. */
export async function writeSessionRecord(
  c: AuthContext,
  sessionId: string,
  record: SessionRecord,
): Promise<void> {
  const ttlSeconds = Math.max(
    60,
    Math.ceil((record.expiresAt - Date.now()) / 1000),
  );
  await c.env.SESSIONS.put(sessionId, JSON.stringify(record), {
    expirationTtl: Math.min(ttlSeconds, SESSION_TTL_SECONDS),
  });
}

/**
 * Load session from cookie + KV. Throws 401 if missing/expired.
 * Sets `userId` on the context and returns it.
 * Expired impersonation tears down the sandbox and restores the actor.
 */
export async function requireUser(c: AuthContext): Promise<string> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) throw new HTTPException(401, { message: "Unauthorized" });

  const raw = await c.env.SESSIONS.get(id);
  if (!raw) {
    deleteCookie(c, SESSION_COOKIE, sessionCookieAttrs(c));
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    await c.env.SESSIONS.delete(id);
    deleteCookie(c, SESSION_COOKIE, sessionCookieAttrs(c));
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (
    typeof record.userId !== "string" ||
    typeof record.expiresAt !== "number" ||
    record.expiresAt < Date.now()
  ) {
    await c.env.SESSIONS.delete(id);
    deleteCookie(c, SESSION_COOKIE, sessionCookieAttrs(c));
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (
    record.impersonation &&
    Date.now() >
      record.impersonation.startedAt + IMPERSONATION_TTL_SECONDS * 1000
  ) {
    // Dynamic import avoids a session ↔ impersonation cycle at module init.
    const { teardownImpersonationSession } = await import(
      "../admin/impersonation"
    );
    record = await teardownImpersonationSession(c, id, record);
  }

  const user = await getDb(c.env)
    .prepare("SELECT disabled_at FROM users WHERE id = ?")
    .bind(record.userId)
    .first<{ disabled_at: string | null }>();
  if (!user || user.disabled_at != null) {
    await destroySession(c);
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  c.set("userId", record.userId);
  return record.userId;
}

/** Session userId if cookie+KV are valid; otherwise null (no throw). */
export async function peekSessionUserId(
  c: AuthContext,
): Promise<string | null> {
  try {
    return await requireUser(c);
  } catch {
    return null;
  }
}

/** Parse a session JSON blob (for unit tests / helpers). */
export function parseSessionRecord(raw: string): SessionRecord | null {
  try {
    const record = JSON.parse(raw) as SessionRecord;
    if (
      typeof record.userId !== "string" ||
      typeof record.expiresAt !== "number"
    ) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

/** True when the session record is still valid. */
export function isSessionActive(
  record: SessionRecord,
  now = Date.now(),
): boolean {
  return record.expiresAt >= now;
}
