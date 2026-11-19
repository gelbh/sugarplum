import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { isAdminUser } from "../admin/allowlist";
import { isAnatomyViewerEnabled } from "./anatomyViewer";
import { getDb } from "../db/client";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleOauthSubject,
  googleRedirectUri,
  OAUTH_KV_PREFIX,
  OAUTH_STATE_TTL_SECONDS,
  pkceChallenge,
  randomUrlSafe,
  type GoogleOAuthPending,
} from "./google";
import {
  OAUTH_CTX_COOKIE,
  OAUTH_DONE_TTL_SECONDS,
  oauthDoneKey,
  parseOAuthDone,
} from "./oauth-replay";
import { hashPassword, isPasswordLongEnough, verifyPassword } from "./password";
import {
  createSession,
  destroySession,
  IMPERSONATION_TTL_SECONDS,
  peekSessionUserId,
  readSessionRecord,
  requireUser,
  sessionCookieSecure,
  type AuthVariables,
} from "./session";
import { verifyTurnstileToken } from "./turnstile";

type AuthEnv = { Bindings: Env; Variables: AuthVariables };

function connectingIp(c: {
  req: { header: (name: string) => string | undefined };
}): string | undefined {
  return c.req.header("CF-Connecting-IP")?.trim() || undefined;
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  disabled_at: string | null;
};

type OauthUserRow = {
  id: string;
  email: string;
  oauth_subject: string | null;
  password_hash: string | null;
  disabled_at: string | null;
};

function newUserId(): string {
  return crypto.randomUUID();
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

export const authRoutes = new Hono<AuthEnv>();

authRoutes.get("/turnstile", (c) => {
  const siteKey = c.env.TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) {
    throw new HTTPException(503, { message: "Turnstile not configured" });
  }
  return c.json({ siteKey });
});

authRoutes.post("/register", async (c) => {
  let body: { email?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) throw new HTTPException(400, { message: "Valid email required" });
  if (!isPasswordLongEnough(password)) {
    throw new HTTPException(400, {
      message: "Password must be at least 12 characters",
    });
  }

  await verifyTurnstileToken(c.env, body.turnstileToken, {
    action: "register",
    remoteip: connectingIp(c),
  });

  const db = getDb(c.env);
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    throw new HTTPException(409, { message: "Email already registered" });
  }

  const id = newUserId();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  try {
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, oauth_subject, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, email, passwordHash, null, createdAt)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|constraint|already exists/i.test(message)) {
      throw new HTTPException(409, { message: "Email already registered" });
    }
    throw err;
  }

  await createSession(c, id);
  return c.json(
    {
      id,
      email,
      anatomy_viewer: isAnatomyViewerEnabled(
        email,
        c.env.ANATOMY_VIEWER_EMAILS,
      ),
    },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  let body: { email?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    throw new HTTPException(400, { message: "Email and password required" });
  }

  await verifyTurnstileToken(c.env, body.turnstileToken, {
    action: "login",
    remoteip: connectingIp(c),
  });

  const db = getDb(c.env);
  const user = await db
    .prepare(
      "SELECT id, email, password_hash, disabled_at FROM users WHERE email = ?",
    )
    .bind(email)
    .first<UserRow>();

  if (!user?.password_hash) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  if (user.disabled_at != null) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  await createSession(c, user.id);
  return c.json({
    id: user.id,
    email: user.email,
    anatomy_viewer: isAnatomyViewerEnabled(
      user.email,
      c.env.ANATOMY_VIEWER_EMAILS,
    ),
  });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const session = await readSessionRecord(c);
  const imp = session?.record.impersonation;

  if (imp && session?.record.actorUserId) {
    // requireUser already bound userId to the source during view-as.
    const [source, actor] = await Promise.all([
      db
        .prepare("SELECT id, email, oauth_subject FROM users WHERE id = ?")
        .bind(userId)
        .first<{ id: string; email: string; oauth_subject: string | null }>(),
      db
        .prepare("SELECT id, email, oauth_subject FROM users WHERE id = ?")
        .bind(session.record.actorUserId)
        .first<{ id: string; email: string; oauth_subject: string | null }>(),
    ]);
    if (!actor) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    if (!source) {
      // Source wiped mid view-as: tear down and return actor /me.
      const { teardownImpersonationSession } =
        await import("../admin/impersonation");
      await teardownImpersonationSession(c, session.id, session.record);
      return c.json({
        id: actor.id,
        email: actor.email,
        google_linked: actor.oauth_subject != null,
        is_admin: isAdminUser(actor, c.env.ADMIN_EMAILS),
        anatomy_viewer: isAnatomyViewerEnabled(
          actor.email,
          c.env.ANATOMY_VIEWER_EMAILS,
        ),
      });
    }
    return c.json({
      id: source.id,
      email: source.email,
      google_linked: source.oauth_subject != null,
      is_admin: isAdminUser(actor, c.env.ADMIN_EMAILS),
      anatomy_viewer: isAnatomyViewerEnabled(
        source.email,
        c.env.ANATOMY_VIEWER_EMAILS,
      ),
      impersonation: {
        sourceUserId: imp.sourceUserId,
        sourceEmail: imp.sourceEmail,
        startedAt: imp.startedAt,
        expiresAt: imp.startedAt + IMPERSONATION_TTL_SECONDS * 1000,
      },
    });
  }

  const user = await db
    .prepare("SELECT id, email, oauth_subject FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; oauth_subject: string | null }>();

  if (!user) throw new HTTPException(401, { message: "Unauthorized" });
  return c.json({
    id: user.id,
    email: user.email,
    google_linked: user.oauth_subject != null,
    is_admin: isAdminUser(user, c.env.ADMIN_EMAILS),
    anatomy_viewer: isAnatomyViewerEnabled(
      user.email,
      c.env.ANATOMY_VIEWER_EMAILS,
    ),
  });
});

function requireGoogleCreds(env: Env): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HTTPException(503, {
      message: "Google Sign-In is not configured",
    });
  }
  return { clientId, clientSecret };
}

function oauthRedirect(
  appUrl: string,
  path: "/login" | "/settings",
  params: Record<string, string>,
): Response {
  const base = appUrl.replace(/\/$/, "") || "";
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function oauthLoginRedirect(appUrl: string, errorCode: string): Response {
  return oauthRedirect(appUrl, "/login", { error: errorCode });
}

function oauthSettingsRedirect(
  appUrl: string,
  params: Record<string, string>,
): Response {
  return oauthRedirect(appUrl, "/settings", params);
}

function oauthCtxCookieAttrs(c: { req: { url: string } }) {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(c.req.url),
    sameSite: "Lax" as const,
    path: "/",
  };
}

function setOAuthCtxCookie(
  c: Parameters<typeof setCookie>[0],
  state: string,
): void {
  setCookie(c, OAUTH_CTX_COOKIE, state, {
    ...oauthCtxCookieAttrs(c),
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
}

function clearOAuthCtxCookie(c: Parameters<typeof deleteCookie>[0]): void {
  deleteCookie(c, OAUTH_CTX_COOKIE, oauthCtxCookieAttrs(c));
}

function oauthCtxMatches(
  c: Parameters<typeof getCookie>[0],
  state: string,
): boolean {
  return getCookie(c, OAUTH_CTX_COOKIE) === state;
}

/** Start Google OIDC (PKCE). Redirects the browser to Google. */
authRoutes.get("/google/start", async (c) => {
  const { clientId } = requireGoogleCreds(c.env);
  const intentRaw = c.req.query("intent");
  const intent = intentRaw === "link" ? "link" : "login";

  let linkUserId: string | undefined;
  if (intent === "link") {
    linkUserId = await requireUser(c);
  }

  const redirectUri = googleRedirectUri(c.env.APP_URL);
  const state = randomUrlSafe(24);
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = await pkceChallenge(codeVerifier);
  const pending: GoogleOAuthPending = {
    codeVerifier,
    createdAt: Date.now(),
    intent,
    ...(linkUserId ? { userId: linkUserId } : {}),
  };
  await c.env.SESSIONS.put(
    `${OAUTH_KV_PREFIX}${state}`,
    JSON.stringify(pending),
    { expirationTtl: OAUTH_STATE_TTL_SECONDS },
  );
  const url = buildGoogleAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });
  setOAuthCtxCookie(c, state);
  return c.redirect(url, 302);
});

function oauthSuccessHome(appUrl: string): string {
  const home = appUrl.replace(/\/$/, "") || "";
  return `${home}/today`;
}

async function storeOAuthDone(
  sessions: Env["SESSIONS"],
  state: string,
  done: { userId: string; intent: "login" | "link" },
): Promise<void> {
  await sessions.put(oauthDoneKey(state), JSON.stringify(done), {
    expirationTtl: OAUTH_DONE_TTL_SECONDS,
  });
}

async function consumeOAuthDone(
  sessions: Env["SESSIONS"],
  state: string,
): Promise<void> {
  await sessions.delete(oauthDoneKey(state));
}

/** Google OAuth callback: login upsert or authenticated Settings link. */
authRoutes.get("/google/callback", async (c) => {
  const { clientId, clientSecret } = requireGoogleCreds(c.env);
  const appUrl = c.env.APP_URL;
  const err = c.req.query("error");

  const code = c.req.query("code");
  const state = c.req.query("state");

  const kvKey = state ? `${OAUTH_KV_PREFIX}${state}` : null;
  const rawPending = kvKey ? await c.env.SESSIONS.get(kvKey) : null;

  // Pending already consumed: replay local success, never re-exchange the code.
  // Mint only with browser-held sp_oauth; matching session alone may finish replay.
  if (state && !rawPending) {
    const doneRaw = await c.env.SESSIONS.get(oauthDoneKey(state));
    const done = doneRaw ? parseOAuthDone(doneRaw) : null;
    if (done) {
      if (done.intent === "link") {
        try {
          const sessionUserId = await requireUser(c);
          if (sessionUserId !== done.userId) {
            return oauthSettingsRedirect(appUrl, { error: "oauth" });
          }
        } catch {
          return oauthSettingsRedirect(appUrl, { error: "oauth" });
        }
        await consumeOAuthDone(c.env.SESSIONS, state);
        clearOAuthCtxCookie(c);
        return oauthSettingsRedirect(appUrl, { linked: "1" });
      }
      const existing = await peekSessionUserId(c);
      if (existing === done.userId) {
        await consumeOAuthDone(c.env.SESSIONS, state);
        clearOAuthCtxCookie(c);
        return c.redirect(oauthSuccessHome(appUrl), 302);
      }
      if (!oauthCtxMatches(c, state)) {
        return oauthLoginRedirect(appUrl, "oauth");
      }
      const replayUser = await getDb(c.env)
        .prepare("SELECT disabled_at FROM users WHERE id = ?")
        .bind(done.userId)
        .first<{ disabled_at: string | null }>();
      if (!replayUser || replayUser.disabled_at != null) {
        await consumeOAuthDone(c.env.SESSIONS, state);
        clearOAuthCtxCookie(c);
        return oauthLoginRedirect(appUrl, "oauth");
      }
      await createSession(c, done.userId);
      await consumeOAuthDone(c.env.SESSIONS, state);
      clearOAuthCtxCookie(c);
      return c.redirect(oauthSuccessHome(appUrl), 302);
    }
  }

  let pending: GoogleOAuthPending | null = null;
  if (rawPending) {
    try {
      pending = JSON.parse(rawPending) as GoogleOAuthPending;
    } catch {
      pending = null;
    }
  }
  const intent = pending?.intent === "link" ? "link" : ("login" as const);
  const fail = (errorCode: string) =>
    intent === "link"
      ? oauthSettingsRedirect(appUrl, { error: errorCode })
      : oauthLoginRedirect(appUrl, errorCode);

  if (err) {
    return fail("oauth_denied");
  }
  if (
    !code ||
    !state ||
    !pending ||
    typeof pending.codeVerifier !== "string" ||
    !oauthCtxMatches(c, state)
  ) {
    return fail("oauth");
  }

  const redirectUri = googleRedirectUri(appUrl);
  let profile;
  try {
    const tokens = await exchangeGoogleCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: pending.codeVerifier,
    });
    profile = await fetchGoogleProfile(tokens.access_token);
  } catch {
    if (kvKey) await c.env.SESSIONS.delete(kvKey);
    return fail("oauth");
  }

  const subject = googleOauthSubject(profile.sub);
  const db = getDb(c.env);

  if (intent === "link") {
    let sessionUserId: string;
    try {
      sessionUserId = await requireUser(c);
    } catch {
      return oauthSettingsRedirect(appUrl, { error: "oauth" });
    }
    if (!pending.userId || pending.userId !== sessionUserId) {
      return oauthSettingsRedirect(appUrl, { error: "oauth" });
    }

    const account = await db
      .prepare(
        "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE id = ?",
      )
      .bind(sessionUserId)
      .first<OauthUserRow>();
    if (!account) {
      return oauthSettingsRedirect(appUrl, { error: "oauth" });
    }
    if (account.email !== profile.email) {
      return oauthSettingsRedirect(appUrl, { error: "oauth_email_mismatch" });
    }

    const bySubject = await db
      .prepare(
        "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE oauth_subject = ?",
      )
      .bind(subject)
      .first<OauthUserRow>();
    if (bySubject && bySubject.id !== account.id) {
      return oauthSettingsRedirect(appUrl, { error: "oauth_conflict" });
    }
    if (account.oauth_subject != null && account.oauth_subject !== subject) {
      return oauthSettingsRedirect(appUrl, { error: "oauth_conflict" });
    }
    if (account.oauth_subject == null) {
      await db
        .prepare("UPDATE users SET oauth_subject = ? WHERE id = ?")
        .bind(subject, account.id)
        .run();
    }
    await storeOAuthDone(c.env.SESSIONS, state, {
      userId: account.id,
      intent: "link",
    });
    if (kvKey) await c.env.SESSIONS.delete(kvKey);
    clearOAuthCtxCookie(c);
    return oauthSettingsRedirect(appUrl, { linked: "1" });
  }

  const bySubject = await db
    .prepare(
      "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE oauth_subject = ?",
    )
    .bind(subject)
    .first<OauthUserRow>();

  let userId: string;
  let disabledAt: string | null = null;
  if (bySubject) {
    userId = bySubject.id;
    disabledAt = bySubject.disabled_at;
  } else {
    const byEmail = await db
      .prepare(
        "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE email = ?",
      )
      .bind(profile.email)
      .first<OauthUserRow>();

    if (byEmail) {
      if (byEmail.oauth_subject != null && byEmail.oauth_subject !== subject) {
        return oauthLoginRedirect(appUrl, "oauth_conflict");
      }
      // Do not auto-link password accounts (unverified email signup → hijack).
      if (byEmail.password_hash != null) {
        return oauthLoginRedirect(appUrl, "oauth_link_required");
      }
      if (byEmail.oauth_subject == null) {
        await db
          .prepare("UPDATE users SET oauth_subject = ? WHERE id = ?")
          .bind(subject, byEmail.id)
          .run();
      }
      userId = byEmail.id;
      disabledAt = byEmail.disabled_at;
    } else {
      userId = newUserId();
      const createdAt = new Date().toISOString();
      try {
        await db
          .prepare(
            "INSERT INTO users (id, email, password_hash, oauth_subject, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(userId, profile.email, null, subject, createdAt)
          .run();
      } catch (insertErr) {
        const message =
          insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (/unique|constraint|already exists/i.test(message)) {
          return oauthLoginRedirect(appUrl, "oauth_conflict");
        }
        throw insertErr;
      }
    }
  }

  if (disabledAt != null) {
    if (kvKey) await c.env.SESSIONS.delete(kvKey);
    clearOAuthCtxCookie(c);
    return oauthLoginRedirect(appUrl, "oauth");
  }

  await createSession(c, userId);
  await storeOAuthDone(c.env.SESSIONS, state, { userId, intent: "login" });
  if (kvKey) await c.env.SESSIONS.delete(kvKey);
  clearOAuthCtxCookie(c);
  return c.redirect(oauthSuccessHome(appUrl), 302);
});
