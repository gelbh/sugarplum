import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";

export const SESSION_COOKIE = "sp_session";
/** 30 days in seconds */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionRecord = {
  userId: string;
  expiresAt: number;
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

/**
 * Load session from cookie + KV. Throws 401 if missing/expired.
 * Sets `userId` on the context and returns it.
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
