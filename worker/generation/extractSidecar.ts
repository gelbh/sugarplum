import type { Env } from "../env";
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

export function extractSidecarKey(jobId: string): string {
  return `generation-extract/${jobId}.json`;
}

export async function putExtractSidecar(
  env: Env,
  jobId: string,
  payload: ExtractSidecarPayload,
): Promise<void> {
  await env.MATERIALS.put(extractSidecarKey(jobId), JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function getExtractSidecar(
  env: Env,
  jobId: string,
): Promise<ExtractSidecarPayload | null> {
  const obj = await env.MATERIALS.get(extractSidecarKey(jobId));
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
  try {
    await env.MATERIALS.delete(extractSidecarKey(jobId));
  } catch (err) {
    console.warn("extract sidecar delete failed", jobId, err);
  }
}
