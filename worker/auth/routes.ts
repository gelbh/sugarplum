import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
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
  hashPassword,
  isPasswordLongEnough,
  verifyPassword,
} from "./password";
import {
  createSession,
  destroySession,
  requireUser,
  type AuthVariables,
} from "./session";

type AuthEnv = { Bindings: Env; Variables: AuthVariables };

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
};

type OauthUserRow = {
  id: string;
  email: string;
  oauth_subject: string | null;
  password_hash: string | null;
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

authRoutes.post("/register", async (c) => {
  let body: { email?: unknown; password?: unknown };
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
  return c.json({ id, email }, 201);
});

authRoutes.post("/login", async (c) => {
  let body: { email?: unknown; password?: unknown };
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

  const db = getDb(c.env);
  const user = await db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  if (!user?.password_hash) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  await createSession(c, user.id);
  return c.json({ id: user.id, email: user.email });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const user = await db
    .prepare("SELECT id, email, oauth_subject FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; oauth_subject: string | null }>();

  if (!user) throw new HTTPException(401, { message: "Unauthorized" });
  return c.json({
    id: user.id,
    email: user.email,
    google_linked: user.oauth_subject != null,
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
  return c.redirect(url, 302);
});

/** Google OAuth callback: login upsert or authenticated Settings link. */
authRoutes.get("/google/callback", async (c) => {
  const { clientId, clientSecret } = requireGoogleCreds(c.env);
  const appUrl = c.env.APP_URL;
  const err = c.req.query("error");

  const code = c.req.query("code");
  const state = c.req.query("state");

  const kvKey = state ? `${OAUTH_KV_PREFIX}${state}` : null;
  const rawPending = kvKey ? await c.env.SESSIONS.get(kvKey) : null;
  if (kvKey) await c.env.SESSIONS.delete(kvKey);

  let pending: GoogleOAuthPending | null = null;
  if (rawPending) {
    try {
      pending = JSON.parse(rawPending) as GoogleOAuthPending;
    } catch {
      pending = null;
    }
  }
  const intent =
    pending?.intent === "link" ? "link" : ("login" as const);
  const fail = (errorCode: string) =>
    intent === "link"
      ? oauthSettingsRedirect(appUrl, { error: errorCode })
      : oauthLoginRedirect(appUrl, errorCode);

  if (err) {
    return fail("oauth_denied");
  }
  if (!code || !state || !pending || typeof pending.codeVerifier !== "string") {
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
        "SELECT id, email, oauth_subject, password_hash FROM users WHERE id = ?",
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
        "SELECT id, email, oauth_subject, password_hash FROM users WHERE oauth_subject = ?",
      )
      .bind(subject)
      .first<OauthUserRow>();
    if (bySubject && bySubject.id !== account.id) {
      return oauthSettingsRedirect(appUrl, { error: "oauth_conflict" });
    }
    if (
      account.oauth_subject != null &&
      account.oauth_subject !== subject
    ) {
      return oauthSettingsRedirect(appUrl, { error: "oauth_conflict" });
    }
    if (account.oauth_subject == null) {
      await db
        .prepare("UPDATE users SET oauth_subject = ? WHERE id = ?")
        .bind(subject, account.id)
        .run();
    }
    return oauthSettingsRedirect(appUrl, { linked: "1" });
  }

  const bySubject = await db
    .prepare(
      "SELECT id, email, oauth_subject, password_hash FROM users WHERE oauth_subject = ?",
    )
    .bind(subject)
    .first<OauthUserRow>();

  let userId: string;
  if (bySubject) {
    userId = bySubject.id;
  } else {
    const byEmail = await db
      .prepare(
        "SELECT id, email, oauth_subject, password_hash FROM users WHERE email = ?",
      )
      .bind(profile.email)
      .first<OauthUserRow>();

    if (byEmail) {
      if (
        byEmail.oauth_subject != null &&
        byEmail.oauth_subject !== subject
      ) {
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

  await createSession(c, userId);
  const home = appUrl.replace(/\/$/, "") || "/";
  return c.redirect(`${home}/`, 302);
});
