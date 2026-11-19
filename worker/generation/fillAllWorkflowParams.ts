export type FillAllWorkflowParams = {
  jobId: string;
  userId: string;
  type?: "qa" | "cloze" | "mcq";
};

export type FillAllStopReason =
  | "complete"
  | "capacity"
  | "not_needs_review"
  | "empty"
  | "error";

export type FillAllRunOutput = {
  attempted: number;
  filled: number;
  skipped: number;
  remaining: number;
  stopReason: FillAllStopReason;
};

export type FillAllRunStatus = {
  runId: string;
  status:
    | "idle"
    | "queued"
    | "running"
    | "complete"
    | "errored"
    | "terminated";
  output: FillAllRunOutput | null;
};

/** Cloudflare instance ids: ^[a-zA-Z0-9_][a-zA-Z0-9-_]*$ (no colons). */
export function fillAllInstanceId(jobId: string): string {
  return `fill-all-${jobId}`;
}
