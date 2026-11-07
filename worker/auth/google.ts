/** Google OIDC helpers (auth-code + PKCE). */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";

export const OAUTH_STATE_TTL_SECONDS = 600;
export const OAUTH_KV_PREFIX = "oauth:google:";

export type GoogleOAuthIntent = "login" | "link" | "calendar";

export type GoogleOAuthPending = {
  codeVerifier: string;
  createdAt: number;
  intent: GoogleOAuthIntent;
  /** Set when intent is link or calendar; session user that requested linking. */
  userId?: string;
};

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

export type GoogleProfile = {
  sub: string;
  email: string;
};

export function googleOauthSubject(sub: string): string {
  return `google:${sub}`;
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafe(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(digest);
}

export function buildGoogleAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function googleRedirectUri(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

export function calendarRedirectUri(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/calendar/callback`;
}

export function buildCalendarAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  if (args.loginHint) params.set("login_hint", args.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCalendarCode(
  args: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ refresh_token?: string; scope?: string; access_token: string }> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    scope: json.scope,
  };
}

export async function exchangeGoogleCode(
  args: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return { access_token: json.access_token };
}

export async function fetchGoogleProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const res = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status})`);
  }
  const json = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!json.sub || !json.email) {
    throw new Error("Google userinfo missing sub or email");
  }
  if (json.email_verified !== true) {
    throw new Error("Google email is not verified");
  }
  return {
    sub: json.sub,
    email: json.email.trim().toLowerCase(),
  };
}
