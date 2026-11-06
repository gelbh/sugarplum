if (process.env.CI || process.env.GITHUB_ACTIONS) {
  throw new Error("eval:live does not run in CI");
}

import { expect, it } from "vitest";
import { createLiveAdapter } from "./live-adapter";
import { runLiveEvalCase } from "./live-run";

const CASES = ["grounded-paragraph", "multi-fact-remainder"] as const;

it("scores grounded-paragraph and multi-fact-remainder", async () => {
  const provider = process.env.EVAL_LIVE_PROVIDER?.trim();
  expect(provider, "EVAL_LIVE_PROVIDER is required").toBeTruthy();
  const llm = createLiveAdapter();
  for (const caseId of CASES) {
    const report = await runLiveEvalCase(caseId, llm);
    if (report.keyFactIdsMissed.length > 0) {
      console.log(
        `${caseId} coverage misses: ${report.keyFactIdsMissed.join(", ")}`,
      );
    }
    if (report.unentailedFronts.length > 0) {
      console.log(
        `${caseId} entailment misses: ${report.unentailedFronts.join("; ")}`,
      );
    }
    expect(report.forbiddenHits).toEqual([]);
    expect(report.ungroundedFronts).toEqual([]);
    expect(report.survivorCount).toBeGreaterThan(0);
  }
});
