/**
 * Live with_golden_llm path: same harvest and Layer-1 as runEvalCase,
 * but the caller supplies the LLM. golden_llm.json is ignored.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeAndDedupeDrafts } from "../../worker/generation/consumer";
import type { LlmAdapter } from "../../worker/generation/llm";
import {
  remainderAfterRules,
  runGenerationPipeline,
} from "../../worker/generation/pipeline";
import { filterDraftsByQuality } from "../../worker/generation/quality";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import type { CardDraft } from "../../worker/generation/schema";
import { scoreEvalCase } from "./score";
import type { EvalMeta, EvalScoreReport } from "./types";

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadMeta(caseDir: string): EvalMeta {
  return JSON.parse(readFileSync(join(caseDir, "meta.json"), "utf8")) as EvalMeta;
}

function loadMaterial(caseDir: string): string {
  return readFileSync(join(caseDir, "material.txt"), "utf8");
}

export async function runLiveEvalCase(
  caseId: string,
  llm: LlmAdapter,
): Promise<EvalScoreReport> {
  const caseDir = join(FIXTURES_ROOT, caseId);
  const meta = loadMeta(caseDir);
  if (meta.id !== caseId) {
    throw new Error(`meta.id ${meta.id} !== directory ${caseId}`);
  }
  if (meta.mode !== "with_golden_llm") {
    throw new Error(
      `eval:live requires with_golden_llm, got ${meta.mode}`,
    );
  }
  const material = loadMaterial(caseDir);

  const rawRules = harvestRuleDrafts(material);
  const layer1Rules = filterDraftsByQuality(rawRules);
  const remainder = remainderAfterRules(material, rawRules);
  let llmDrafts: CardDraft[] = [];
  if (remainder.trim()) {
    llmDrafts = await runGenerationPipeline({
      text: remainder,
      llm,
      apiKey: process.env.EVAL_LIVE_API_KEY ?? "",
      provider: process.env.EVAL_LIVE_PROVIDER?.trim() || "openai",
    });
  }
  const merged = mergeAndDedupeDrafts(layer1Rules, llmDrafts);
  const survivors = filterDraftsByQuality(merged);
  return scoreEvalCase(survivors, material, meta);
}
