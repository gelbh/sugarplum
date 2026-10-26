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

/** Create a KV session and set the HttpOnly Secure SameSite=Lax cookie. */
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
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return id;
}

/** Delete the session from KV and clear the cookie. */
export async function destroySession(c: AuthContext): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.env.SESSIONS.delete(id);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/**
 * Load session from cookie + KV. Throws 401 if missing/expired.
 * Sets `userId` on the context and returns it.
 */
export async function requireUser(c: AuthContext): Promise<string> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) throw new HTTPException(401, { message: "Unauthorized" });

  const raw = await c.env.SESSIONS.get(id);
  if (!raw) throw new HTTPException(401, { message: "Unauthorized" });

  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    await c.env.SESSIONS.delete(id);
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (
    typeof record.userId !== "string" ||
    typeof record.expiresAt !== "number" ||
    record.expiresAt < Date.now()
  ) {
    await c.env.SESSIONS.delete(id);
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  c.set("userId", record.userId);
  return record.userId;
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
