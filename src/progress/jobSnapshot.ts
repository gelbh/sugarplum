import type { ProgressSnapshot } from "./types";
import { friendlyStageHeadline } from "./copy";

export function buildJobProgressSnapshot(
  jobId: string,
  status: string,
  progress: {
    stage?: string | null;
    label?: string | null;
    current?: number;
    total?: number;
    percent?: number;
  } | null,
): ProgressSnapshot {
  if (status === "queued") {
    return {
      id: jobId,
      label: friendlyStageHeadline("queued"),
      mode: "indeterminate",
      percent: 0,
      source: "job",
      stage: "queued",
      presentStages: ["queued"],
    };
  }
  if (!progress) {
    return {
      id: jobId,
      label: friendlyStageHeadline(null),
      mode: "indeterminate",
      percent: 0,
      source: "job",
    };
  }
  const measurable = (progress.total ?? 0) > 0;
  // Claim heartbeat can leave progress.stage === "queued" while status is
  // already "running"; that is not the calm in-line wait stage.
  const stage =
    progress.stage && progress.stage !== "queued"
      ? progress.stage
      : undefined;
  return {
    id: jobId,
    label: stage
      ? friendlyStageHeadline(stage)
      : progress.label || friendlyStageHeadline(null),
    mode: measurable ? "determinate" : "indeterminate",
    percent: progress.percent ?? 0,
    source: "job",
    stage,
  };
}
