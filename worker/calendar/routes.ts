import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import {
  matchSubject,
  parseClusters,
  type CalendarEventIn,
  type Cluster,
} from "../../src/calendar/parse";
import {
  buildCalendarAuthorizeUrl,
  calendarRedirectUri,
  exchangeCalendarCode,
  GOOGLE_TOKEN_URL,
  OAUTH_KV_PREFIX,
  OAUTH_STATE_TTL_SECONDS,
  pkceChallenge,
  randomUrlSafe,
  type GoogleOAuthPending,
} from "../auth/google";
import { OAUTH_CTX_COOKIE } from "../auth/oauth-replay";
import {
  requireUser,
  sessionCookieSecure,
  type AuthVariables,
} from "../auth/session";
import { decryptSecret, encryptSecret } from "../crypto/secrets";
import { getDb } from "../db/client";
import type { Env } from "../env";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const calendarRoutes = new Hono<AppEnv>();

const EVENTS_SCOPE = "calendar.events.readonly";
const FREEBUSY_SCOPE = "calendar.freebusy";
const LIST_SCOPE = "calendar.calendarlist.readonly";
const CLUSTER_CACHE_TTL = 1800;
const EVENT_WINDOW_DAYS = 21;

type ConnectionRow = {
  refresh_ciphertext: string;
  scopes: string;
};

type SubjectRow = { id: string; title: string };

function hasScope(scopes: string, needle: string): boolean {
  return scopes.split(/\s+/).some((s) => s === needle || s.endsWith(`/${needle}`));
}

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

function oauthCtxCookieAttrs(c: { req: { url: string } }) {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(c.req.url),
    sameSite: "Lax" as const,
    path: "/",
  };
}

function settingsRedirect(appUrl: string, params: Record<string, string>): Response {
  const base = appUrl.replace(/\/$/, "") || "";
  const url = new URL(`${base}/settings`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function clusterCacheKey(userId: string): string {
  return `calendar:clusters:${userId}`;
}

function reconnectKey(userId: string): string {
  return `calendar:reconnect:${userId}`;
}

async function loadConnection(
  db: D1Database,
  userId: string,
): Promise<ConnectionRow | null> {
  return db
    .prepare(
      "SELECT refresh_ciphertext, scopes FROM calendar_connections WHERE user_id = ?",
    )
    .bind(userId)
    .first<ConnectionRow>();
}

async function deleteConnection(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("DELETE FROM calendar_connections WHERE user_id = ?")
    .bind(userId)
    .run();
  await db
    .prepare("DELETE FROM calendar_subject_links WHERE user_id = ?")
    .bind(userId)
    .run();
  await db
    .prepare("DELETE FROM calendar_dismissals WHERE user_id = ?")
    .bind(userId)
    .run();
}

async function refreshAccessToken(
  env: Env,
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string } | { invalidGrant: true }> {
  const { clientId, clientSecret } = requireGoogleCreds(env);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    let err = "";
    try {
      const json = (await res.json()) as { error?: string };
      err = json.error ?? "";
    } catch {
      /* ignore */
    }
    if (err === "invalid_grant" || res.status === 400) {
      return { invalidGrant: true };
    }
    throw new Error(`Google refresh failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google refresh missing access_token");
  return { accessToken: json.access_token };
}

async function listSelectedCalendarIds(
  accessToken: string,
  scopes: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  if (!hasScope(scopes, LIST_SCOPE)) return ["primary"];
  const res = await fetchImpl(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,selected)",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return ["primary"];
  const json = (await res.json()) as {
    items?: { id?: string; selected?: boolean }[];
  };
  const ids = (json.items ?? [])
    .filter((item) => item.selected === true && item.id)
    .map((item) => item.id!);
  return ids.length > 0 ? ids : ["primary"];
}

async function listEventsForCalendars(
  accessToken: string,
  calendarIds: string[],
  fetchImpl: typeof fetch,
): Promise<CalendarEventIn[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(
    Date.now() + EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const fields =
    "items(id,summary,start,end,recurringEventId,eventType,status),nextPageToken";
  const events: CalendarEventIn[] = [];
  for (const calendarId of calendarIds) {
    let pageToken: string | undefined;
    for (;;) {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        fields,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const res = await fetchImpl(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 403 || res.status === 404) break;
      if (!res.ok) break;
      const json = (await res.json()) as {
        items?: CalendarEventIn[];
        nextPageToken?: string;
      };
      for (const item of json.items ?? []) events.push(item);
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
  }
  return events;
}

async function loadClusters(
  c: { env: Env },
  userId: string,
  connection: ConnectionRow,
  fetchImpl: typeof fetch = fetch,
): Promise<Cluster[] | "reconnect" | "empty"> {
  if (!hasScope(connection.scopes, EVENTS_SCOPE)) return "empty";

  const cached = await c.env.SESSIONS.get(clusterCacheKey(userId));
  if (cached) {
    try {
      return JSON.parse(cached) as Cluster[];
    } catch {
      /* refetch */
    }
  }

  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(
      connection.refresh_ciphertext,
      c.env.SECRETS_WRAP_KEY,
    );
  } catch {
    return "empty";
  }

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(c.env, refreshToken, fetchImpl);
    if ("invalidGrant" in refreshed) {
      await deleteConnection(getDb(c.env), userId);
      await c.env.SESSIONS.delete(clusterCacheKey(userId));
      await c.env.SESSIONS.put(reconnectKey(userId), "1");
      return "reconnect";
    }
    accessToken = refreshed.accessToken;
  } catch {
    return "empty";
  }

  try {
    const calendarIds = await listSelectedCalendarIds(
      accessToken,
      connection.scopes,
      fetchImpl,
    );
    const events = await listEventsForCalendars(
      accessToken,
      calendarIds,
      fetchImpl,
    );
    const clusters = parseClusters(events);
    await c.env.SESSIONS.put(
      clusterCacheKey(userId),
      JSON.stringify(clusters),
      { expirationTtl: CLUSTER_CACHE_TTL },
    );
    return clusters;
  } catch {
    return "empty";
  }
}

calendarRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const connection = await loadConnection(getDb(c.env), userId);
  if (!connection) {
    const reconnect = (await c.env.SESSIONS.get(reconnectKey(userId))) === "1";
    return c.json({
      suggestions: false,
      gaps: false,
      reconnect,
    });
  }
  return c.json({
    suggestions: hasScope(connection.scopes, EVENTS_SCOPE),
    gaps: hasScope(connection.scopes, FREEBUSY_SCOPE),
    reconnect: false,
  });
});

calendarRoutes.get("/connect", async (c) => {
  const userId = await requireUser(c);
  const { clientId } = requireGoogleCreds(c.env);
  const db = getDb(c.env);
  const user = await db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();

  const redirectUri = calendarRedirectUri(c.env.APP_URL);
  const state = randomUrlSafe(24);
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = await pkceChallenge(codeVerifier);
  const pending: GoogleOAuthPending = {
    codeVerifier,
    createdAt: Date.now(),
    intent: "calendar",
    userId,
  };
  await c.env.SESSIONS.put(
    `${OAUTH_KV_PREFIX}${state}`,
    JSON.stringify(pending),
    { expirationTtl: OAUTH_STATE_TTL_SECONDS },
  );
  const url = buildCalendarAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
    loginHint: user?.email,
  });
  setCookie(c, OAUTH_CTX_COOKIE, state, {
    ...oauthCtxCookieAttrs(c),
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return c.redirect(url, 302);
});

calendarRoutes.get("/callback", async (c) => {
  const appUrl = c.env.APP_URL;
  const err = c.req.query("error");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const kvKey = state ? `${OAUTH_KV_PREFIX}${state}` : null;
  const rawPending = kvKey ? await c.env.SESSIONS.get(kvKey) : null;

  const fail = () => settingsRedirect(appUrl, { error: "calendar" });

  if (err || !code || !state || !rawPending) return fail();
  if (getCookie(c, OAUTH_CTX_COOKIE) !== state) return fail();

  let pending: GoogleOAuthPending;
  try {
    pending = JSON.parse(rawPending) as GoogleOAuthPending;
  } catch {
    return fail();
  }
  if (pending.intent !== "calendar" || !pending.userId) return fail();

  let sessionUserId: string;
  try {
    sessionUserId = await requireUser(c);
  } catch {
    return fail();
  }
  if (sessionUserId !== pending.userId) return fail();

  const { clientId, clientSecret } = requireGoogleCreds(c.env);
  const redirectUri = calendarRedirectUri(appUrl);
  let tokens: Awaited<ReturnType<typeof exchangeCalendarCode>>;
  try {
    tokens = await exchangeCalendarCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: pending.codeVerifier,
    });
  } catch {
    if (kvKey) await c.env.SESSIONS.delete(kvKey);
    return fail();
  }

  if (kvKey) await c.env.SESSIONS.delete(kvKey);
  deleteCookie(c, OAUTH_CTX_COOKIE, oauthCtxCookieAttrs(c));

  if (!tokens.refresh_token) {
    return settingsRedirect(appUrl, { error: "calendar_refresh" });
  }

  const wrapKey = c.env.SECRETS_WRAP_KEY;
  if (!wrapKey) {
    return settingsRedirect(appUrl, { error: "calendar" });
  }
  const ciphertext = await encryptSecret(tokens.refresh_token, wrapKey);
  const scopes = tokens.scope?.trim() || "";
  const updatedAt = new Date().toISOString();
  const db = getDb(c.env);
  const existing = await loadConnection(db, sessionUserId);
  if (existing) {
    await db
      .prepare(
        "UPDATE calendar_connections SET refresh_ciphertext = ?, scopes = ?, updated_at = ? WHERE user_id = ?",
      )
      .bind(ciphertext, scopes, updatedAt, sessionUserId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO calendar_connections (user_id, refresh_ciphertext, scopes, updated_at) VALUES (?, ?, ?, ?)",
      )
      .bind(sessionUserId, ciphertext, scopes, updatedAt)
      .run();
  }
  await c.env.SESSIONS.delete(clusterCacheKey(sessionUserId));
  await c.env.SESSIONS.delete(reconnectKey(sessionUserId));
  return settingsRedirect(appUrl, { calendar: "1" });
});

calendarRoutes.delete("/", async (c) => {
  const userId = await requireUser(c);
  await deleteConnection(getDb(c.env), userId);
  await c.env.SESSIONS.delete(clusterCacheKey(userId));
  await c.env.SESSIONS.delete(reconnectKey(userId));
  return c.json({ ok: true });
});

calendarRoutes.get("/suggestions", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const empty = { subjects: [], decksBySubjectId: {} as Record<string, string[]> };
  const connection = await loadConnection(db, userId);
  if (!connection) return c.json(empty);

  const clustersOr = await loadClusters(c, userId, connection);
  if (clustersOr === "reconnect" || clustersOr === "empty") return c.json(empty);
  const clusters = clustersOr;

  const [linkRows, dismissRows, subjectRows] = await Promise.all([
    db
      .prepare(
        "SELECT cluster_key, subject_id FROM calendar_subject_links WHERE user_id = ?",
      )
      .bind(userId)
      .all<{ cluster_key: string; subject_id: string }>(),
    db
      .prepare("SELECT cluster_key FROM calendar_dismissals WHERE user_id = ?")
      .bind(userId)
      .all<{ cluster_key: string }>(),
    db
      .prepare("SELECT id, title FROM subjects WHERE user_id = ?")
      .bind(userId)
      .all<SubjectRow>(),
  ]);

  const dismissed = new Set(dismissRows.results.map((row) => row.cluster_key));
  const links = new Map(
    linkRows.results.map((row) => [row.cluster_key, row.subject_id]),
  );
  const subjects = subjectRows.results;
  const decksBySubjectId: Record<string, string[]> = {};
  const pending: {
    clusterKey: string;
    title: string;
    evidence: string;
    linkSubjectId: string | null;
  }[] = [];

  for (const cluster of clusters) {
    if (dismissed.has(cluster.key)) continue;
    const linkedId = links.get(cluster.key);
    if (linkedId) {
      decksBySubjectId[linkedId] = cluster.chips;
      continue;
    }
    const match = matchSubject(cluster, subjects);
    pending.push({
      clusterKey: cluster.key,
      title: cluster.title,
      evidence: `${cluster.eventCount} events`,
      linkSubjectId: match.kind === "link" ? match.subjectId : null,
    });
  }

  return c.json({ subjects: pending, decksBySubjectId });
});

calendarRoutes.post("/links", async (c) => {
  const userId = await requireUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const clusterKey =
    typeof record.clusterKey === "string" ? record.clusterKey.trim() : "";
  const subjectId =
    typeof record.subjectId === "string" ? record.subjectId.trim() : "";
  if (!clusterKey || !subjectId) {
    throw new HTTPException(400, { message: "Invalid link body" });
  }
  const db = getDb(c.env);
  const owned = await db
    .prepare("SELECT id, title FROM subjects WHERE user_id = ?")
    .bind(userId)
    .all<{ id: string; title: string }>();
  if (!owned.results.some((row) => row.id === subjectId)) {
    throw new HTTPException(404, { message: "Subject not found" });
  }
  await db
    .prepare(
      "INSERT INTO calendar_subject_links (user_id, cluster_key, subject_id, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(userId, clusterKey, subjectId, new Date().toISOString())
    .run();
  await c.env.SESSIONS.delete(clusterCacheKey(userId));
  return c.json({ ok: true });
});

calendarRoutes.post("/dismissals", async (c) => {
  const userId = await requireUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const clusterKey =
    typeof record.clusterKey === "string" ? record.clusterKey.trim() : "";
  if (!clusterKey) {
    throw new HTTPException(400, { message: "Invalid dismissal body" });
  }
  await getDb(c.env)
    .prepare(
      "INSERT INTO calendar_dismissals (user_id, cluster_key, created_at) VALUES (?, ?, ?)",
    )
    .bind(userId, clusterKey, new Date().toISOString())
    .run();
  await c.env.SESSIONS.delete(clusterCacheKey(userId));
  return c.json({ ok: true });
});
