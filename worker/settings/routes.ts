import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { encryptSecret, parseSecretMeta } from "../crypto/secrets";
import {
  isUserLlmProvider,
  resolveZaiTextModel,
  USER_LLM_PROVIDERS,
  ZAI_TEXT_MODELS,
} from "../generation/llm";
import {
  clampStudyPrefs,
  loadStudyPrefs,
  saveStudyPrefs,
  studyPrefsResponse,
} from "../study/prefs";
import type { StudyPrefs } from "../study/queue";
import {
  countUserReviews,
  exportRevlogCsv,
  FsrsRescheduleError,
  getFsrsOptimizeStatus,
  InvalidFsrsWeightsError,
  isOptimizeDue,
  resetFsrsWeights,
  saveFsrsWeights,
  setOptimizePending,
} from "../study/fsrsOptimize";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type SecretRow = {
  provider: string;
  ciphertext: string;
  model: string | null;
};

export type LlmSettingsConfigured = {
  provider: string;
  last4: string;
  model: string | null;
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
    .prepare(
      "SELECT provider, ciphertext, model FROM user_secrets WHERE user_id = ?",
    )
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
    model: row.model ?? null,
    configured: true,
  } satisfies LlmSettingsConfigured);
});

settingsRoutes.put("/llm", async (c) => {
  const userId = await requireUser(c);

  let body: { provider?: unknown; apiKey?: unknown; model?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const provider =
    typeof body.provider === "string" ? body.provider.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";

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

  let model: string | null = null;
  if (normalized === "zai") {
    model = resolveZaiTextModel(rawModel);
    if (!model) {
      throw new HTTPException(400, {
        message: `Unsupported model. Allowed: ${ZAI_TEXT_MODELS.join(", ")}`,
      });
    }
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
      `INSERT INTO user_secrets (user_id, provider, ciphertext, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         provider = excluded.provider,
         ciphertext = excluded.ciphertext,
         model = excluded.model,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, normalized, ciphertext, model, now, now)
    .run();

  const meta = parseSecretMeta(ciphertext)!;
  return c.json({
    provider: normalized,
    last4: meta.last4,
    model,
    configured: true,
  } satisfies LlmSettingsConfigured);
});

settingsRoutes.delete("/llm", async (c) => {
  const userId = await requireUser(c);
  await getDb(c.env)
    .prepare("DELETE FROM user_secrets WHERE user_id = ?")
    .bind(userId)
    .run();
  return c.json({ configured: false } satisfies LlmSettingsMissing);
});

settingsRoutes.get("/study", async (c) => {
  const userId = await requireUser(c);
  const prefs = await loadStudyPrefs(getDb(c.env), userId);
  return c.json(studyPrefsResponse(prefs) satisfies StudyPrefs);
});

settingsRoutes.put("/study", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);

  let body: {
    introBudget?: unknown;
    reviewBudget?: unknown;
    rFloor?: unknown;
    desiredRetention?: unknown;
    enableFuzz?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const existing = await loadStudyPrefs(db, userId);
  const clamped = clampStudyPrefs(body, existing);
  const prefs = await saveStudyPrefs(db, userId, clamped);
  return c.json(prefs satisfies StudyPrefs);
});

settingsRoutes.get("/study/fsrs-optimize", async (c) => {
  const userId = await requireUser(c);
  const status = await getFsrsOptimizeStatus(getDb(c.env), userId);
  return c.json(status);
});

settingsRoutes.get("/study/fsrs-revlog.csv", async (c) => {
  const userId = await requireUser(c);
  const csv = await exportRevlogCsv(getDb(c.env), userId);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});

settingsRoutes.put("/study/fsrs-weights", async (c) => {
  const userId = await requireUser(c);
  let body: { w?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  try {
    const { w, rescheduled } = await saveFsrsWeights(
      getDb(c.env),
      userId,
      body.w,
    );
    return c.json({
      ok: true as const,
      wLength: w.length,
      rescheduled,
    });
  } catch (err) {
    if (err instanceof InvalidFsrsWeightsError) {
      throw new HTTPException(400, { message: "Invalid FSRS weights" });
    }
    if (err instanceof FsrsRescheduleError) {
      throw new HTTPException(500, { message: err.message });
    }
    throw err;
  }
});

settingsRoutes.post("/study/fsrs-weights/reset", async (c) => {
  const userId = await requireUser(c);
  try {
    const { rescheduled } = await resetFsrsWeights(getDb(c.env), userId);
    return c.json({ ok: true as const, rescheduled });
  } catch (err) {
    if (err instanceof FsrsRescheduleError) {
      throw new HTTPException(500, { message: err.message });
    }
    throw err;
  }
});

settingsRoutes.post("/study/fsrs-optimize/run", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const prefs = await loadStudyPrefs(db, userId);
  const reviewCount = await countUserReviews(db, userId);
  if (!isOptimizeDue(reviewCount, prefs.fsrsLastOptimizedAt ?? null, new Date())) {
    throw new HTTPException(400, { message: "Not eligible to optimize" });
  }
  await setOptimizePending(db, userId, true);
  return c.json({ ok: true as const, pending: true as const });
});
