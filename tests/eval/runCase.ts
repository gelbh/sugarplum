/**
 * Mirrors consumer text draft steps (harvest → Layer-1 → optional LLM →
 * mergeAndDedupeDrafts → Layer-1). Production also LLM-critiques rules after
 * Layer-1; with_golden_llm intentionally skips live rules-critique and uses
 * Layer-1 rules only (see grounded-eval-harness design §4.2).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeAndDedupeDrafts } from "../../worker/generation/consumer";
import {
  remainderAfterRules,
  runGenerationPipeline,
  type PipelineLlm,
} from "../../worker/generation/pipeline";
import { filterDraftsByQuality } from "../../worker/generation/quality";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import type { CardDraft } from "../../worker/generation/schema";
import { scoreEvalCase } from "./score";
import type { EvalMeta, EvalScoreReport } from "./types";

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function listEvalCaseIds(): string[] {
  return readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function loadMeta(caseDir: string): EvalMeta {
  return JSON.parse(readFileSync(join(caseDir, "meta.json"), "utf8")) as EvalMeta;
}

function loadMaterial(caseDir: string): string {
  return readFileSync(join(caseDir, "material.txt"), "utf8");
}

function loadGolden(caseDir: string): CardDraft[] {
  return JSON.parse(
    readFileSync(join(caseDir, "golden_llm.json"), "utf8"),
  ) as CardDraft[];
}

function keepAllCritiqueLlm(golden: CardDraft[]): PipelineLlm {
  return {
    generateDrafts: async () => golden,
    complete: async () => JSON.stringify({ cards: golden }),
  };
}

export async function runEvalCase(caseId: string): Promise<EvalScoreReport> {
  const caseDir = join(FIXTURES_ROOT, caseId);
  const meta = loadMeta(caseDir);
  if (meta.id !== caseId) {
    throw new Error(`meta.id ${meta.id} !== directory ${caseId}`);
  }
  const material = loadMaterial(caseDir);

  const rawRules = harvestRuleDrafts(material);
  const layer1Rules = filterDraftsByQuality(rawRules);

  let survivors: CardDraft[];
  if (meta.mode === "rules_only") {
    survivors = layer1Rules;
  } else if (meta.mode === "with_golden_llm") {
    const golden = loadGolden(caseDir);
    const remainder = remainderAfterRules(material, rawRules);
    let llmDrafts: CardDraft[] = [];
    if (remainder.trim()) {
      llmDrafts = await runGenerationPipeline({
        text: remainder,
        llm: keepAllCritiqueLlm(golden),
        apiKey: "eval",
        provider: "eval-mock",
      });
    }
    const merged = mergeAndDedupeDrafts(layer1Rules, llmDrafts);
    survivors = filterDraftsByQuality(merged);
  } else {
    const _exhaustive: never = meta.mode;
    throw new Error(`Unknown mode: ${_exhaustive}`);
  }

  return scoreEvalCase(survivors, material, meta);
}
