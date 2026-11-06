export type EvalMode = "rules_only" | "with_golden_llm";

export type EvalKeyFact = { id: string; match: string[] };
export type EvalForbidden = { id: string; match: string };

export type EvalExpect = {
  min_survivors: number;
  max_survivors?: number;
  min_key_fact_coverage: number;
  require_zero_forbidden?: boolean; // default true
};

export type EvalMeta = {
  id: string;
  description: string;
  mode: EvalMode;
  key_facts: EvalKeyFact[];
  forbidden: EvalForbidden[];
  expect: EvalExpect;
};

export type EvalScoreReport = {
  ok: boolean;
  survivorCount: number;
  keyFactsCovered: number;
  keyFactCoverage: number;
  keyFactIdsMissed: string[];
  forbiddenHits: { id: string; matchedIn: string }[];
  ungroundedFronts: string[];
  unentailedFronts: string[];
  failures: string[];
};
