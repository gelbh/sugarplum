import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { encryptSecret, parseSecretMeta } from "../crypto/secrets";
import {
  isUserLlmProvider,
  USER_LLM_PROVIDERS,
} from "../generation/llm";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type SecretRow = {
  provider: string;
  ciphertext: string;
};

export type LlmSettingsConfigured = {
  provider: string;
  last4: string;
  configured: true;
};

export type LlmSettingsMissing = {
  configured: false;
};

export type LlmSettingsResponse = LlmSettingsConfigured | LlmSettingsMissing;

function requireWrapKey(env: Env): string {
  const key = env.SECRETS_WRAP_KEY;
  if (!key) {
    throw new HTTPException(500, { message: "Secrets wrap key not configured" });
  }
  return key;
}

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/llm", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const row = await db
    .prepare("SELECT provider, ciphertext FROM user_secrets WHERE user_id = ?")
    .bind(userId)
    .first<SecretRow>();

  if (!row) {
    return c.json({ configured: false } satisfies LlmSettingsMissing);
  }

  const meta = parseSecretMeta(row.ciphertext);
  if (!meta) {
    throw new HTTPException(500, { message: "Stored secret is corrupt" });
  }

  return c.json({
    provider: row.provider,
    last4: meta.last4,
    configured: true,
  } satisfies LlmSettingsConfigured);
});

settingsRoutes.put("/llm", async (c) => {
  const userId = await requireUser(c);

  let body: { provider?: unknown; apiKey?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const provider =
    typeof body.provider === "string" ? body.provider.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

  if (!provider) {
    throw new HTTPException(400, { message: "provider required" });
  }
  const normalized = provider.toLowerCase();
  if (!isUserLlmProvider(normalized)) {
    throw new HTTPException(400, {
      message: `Unsupported provider. Allowed: ${USER_LLM_PROVIDERS.join(", ")}`,
    });
  }
  if (!apiKey.trim()) {
    throw new HTTPException(400, { message: "apiKey required" });
  }

  const wrapKey = requireWrapKey(c.env);
  let ciphertext: string;
  try {
    ciphertext = await encryptSecret(apiKey, wrapKey);
  } catch {
    throw new HTTPException(500, { message: "Failed to encrypt API key" });
  }

  const now = new Date().toISOString();
  const db = getDb(c.env);
  await db
    .prepare(
      `INSERT INTO user_secrets (user_id, provider, ciphertext, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         provider = excluded.provider,
         ciphertext = excluded.ciphertext,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, normalized, ciphertext, now, now)
    .run();

  const meta = parseSecretMeta(ciphertext)!;
  return c.json({
    provider: normalized,
    last4: meta.last4,
    configured: true,
  } satisfies LlmSettingsConfigured);
});
