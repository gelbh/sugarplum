import type { Env } from "../env";
import {
  applySandboxKeyPrefix,
  sandboxWriteUserId,
} from "../admin/sandbox-r2";
import { getDb } from "../db/client";
import type { WindowResume } from "./study-windows";
import type { CardDraft } from "./schema";

export type ExtractSidecarMeta = {
  windowResume: WindowResume | null;
  /** Pass-1 drafts for gap-fill / coverage; kept out of Workflow step return values. */
  drafts: CardDraft[];
};

export type ExtractSidecarPayload = ExtractSidecarMeta & {
  text: string;
};

export function extractSidecarKey(
  jobId: string,
  sandboxUserId?: string | null,
): string {
  return applySandboxKeyPrefix(
    sandboxUserId,
    `generation-extract/${jobId}.json`,
  );
}

async function sandboxIdForJob(
  env: Env,
  jobId: string,
): Promise<string | null> {
  const row = await getDb(env)
    .prepare(
      `SELECT d.user_id AS user_id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ?`,
    )
    .bind(jobId)
    .first<{ user_id: string }>();
  return row ? sandboxWriteUserId(getDb(env), row.user_id) : null;
}

async function resolveExtractKey(env: Env, jobId: string): Promise<string> {
  const sandboxId = await sandboxIdForJob(env, jobId);
  return extractSidecarKey(jobId, sandboxId);
}

export async function putExtractSidecar(
  env: Env,
  jobId: string,
  payload: ExtractSidecarPayload,
): Promise<void> {
  const key = await resolveExtractKey(env, jobId);
  await env.MATERIALS.put(key, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function getExtractSidecar(
  env: Env,
  jobId: string,
): Promise<ExtractSidecarPayload | null> {
  const sandboxId = await sandboxIdForJob(env, jobId);
  let obj = await env.MATERIALS.get(extractSidecarKey(jobId, sandboxId));
  if (!obj && sandboxId) {
    obj = await env.MATERIALS.get(extractSidecarKey(jobId));
  }
  if (!obj) return null;
  try {
    const parsed = JSON.parse(await obj.text()) as ExtractSidecarPayload;
    if (typeof parsed.text !== "string" || !Array.isArray(parsed.drafts)) {
      return null;
    }
    return {
      text: parsed.text,
      windowResume: parsed.windowResume ?? null,
      drafts: parsed.drafts,
    };
  } catch {
    return null;
  }
}

export async function deleteExtractSidecar(
  env: Env,
  jobId: string,
): Promise<void> {
  const sandboxId = await sandboxIdForJob(env, jobId);
  const keys = [extractSidecarKey(jobId, sandboxId)];
  if (sandboxId) keys.push(extractSidecarKey(jobId));
  for (const key of keys) {
    try {
      await env.MATERIALS.delete(key);
    } catch (err) {
      console.warn("extract sidecar delete failed", jobId, key, err);
    }
  }
}
