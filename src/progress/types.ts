export type ProgressMode = "determinate" | "indeterminate";

export type ProgressSource = "client" | "job";

export type ProgressEvent = {
  at: number;
  kind: "excerpt" | "draft" | "stage";
  stage: string;
  text: string;
};

export type FreeQuota = { used: number; cap: number; remaining: number } | null;

export type ProgressSnapshot = {
  id: string;
  label: string;
  mode: ProgressMode;
  /** 0–100; only meaningful when mode === "determinate" */
  percent: number;
  detail?: string;
  source: ProgressSource;
  /** Optional fields populated for job-backed snapshots */
  startedAt?: number;
  tokensUsed?: number;
  tokensPrompt?: number;
  tokensCompletion?: number;
  current?: number;
  total?: number;
  draftsSoFar?: number;
  path?: "free" | "byo" | null;
  freeQuota?: FreeQuota;
  events?: ProgressEvent[];
  /** Current catalog stage name (e.g. "generate") */
  stage?: string;
  /** Ordered unique stages present in this run (derived from events + stage) */
  presentStages?: string[];
};
