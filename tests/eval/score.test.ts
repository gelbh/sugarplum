import { describe, expect, it } from "vitest";
import { scoreEvalCase } from "./score";
import type { EvalMeta } from "./types";
import type { CardDraft } from "../../worker/generation/schema";

function qa(front: string, back: string, excerpt: string): CardDraft {
  return {
    type: "qa",
    front,
    back,
    provenance: { pages: [1], excerpt },
  };
}

const material = "ATP is adenosine triphosphate made in mitochondria.";

const baseMeta: EvalMeta = {
  id: "unit",
  description: "unit",
  mode: "rules_only",
  key_facts: [{ id: "atp", match: ["adenosine triphosphate", "ATP"] }],
  forbidden: [{ id: "invented", match: "unicorn enzyme" }],
  expect: {
    min_survivors: 1,
    min_key_fact_coverage: 1,
    require_zero_forbidden: true,
  },
};

describe("scoreEvalCase", () => {
  it("passes grounded covering survivors", () => {
    const survivors = [
      qa("What is ATP?", "Adenosine triphosphate", "ATP is adenosine"),
    ];
    const report = scoreEvalCase(survivors, material, baseMeta);
    expect(report.ok).toBe(true);
    expect(report.forbiddenHits).toEqual([]);
    expect(report.keyFactIdsMissed).toEqual([]);
    expect(report.ungroundedFronts).toEqual([]);
  });

  it("fails on forbidden match", () => {
    const survivors = [
      qa("What is ATP?", "unicorn enzyme", "ATP is adenosine"),
    ];
    const report = scoreEvalCase(survivors, material, baseMeta);
    expect(report.ok).toBe(false);
    expect(report.forbiddenHits.map((h) => h.id)).toContain("invented");
  });

  it("fails on ungrounded excerpt", () => {
    const survivors = [
      qa("What is ATP?", "Adenosine triphosphate", "not in the source at all"),
    ];
    const report = scoreEvalCase(survivors, material, baseMeta);
    expect(report.ok).toBe(false);
    expect(report.ungroundedFronts).toContain("What is ATP?");
  });

  it("fails when key fact uncovered", () => {
    const survivors = [
      qa("Where is ATP made?", "mitochondria", "made in mitochondria"),
    ];
    const meta: EvalMeta = {
      ...baseMeta,
      key_facts: [{ id: "atp-name", match: ["adenosine triphosphate"] }],
    };
    const report = scoreEvalCase(survivors, material, meta);
    expect(report.ok).toBe(false);
    expect(report.keyFactIdsMissed).toContain("atp-name");
  });

  it("treats empty key_facts as full coverage", () => {
    const meta: EvalMeta = {
      ...baseMeta,
      key_facts: [],
      expect: { min_survivors: 0, min_key_fact_coverage: 1, require_zero_forbidden: true },
    };
    const report = scoreEvalCase([], material, meta);
    expect(report.keyFactCoverage).toBe(1);
    expect(report.ok).toBe(true);
  });
});
