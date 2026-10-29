import { friendlyStageHeadline } from "../progress/copy";

export type ShellGenerationKind = "drafts_ready" | "failed" | "generating";

export type ShellGenerationJourneyInput = {
  openReviewJobId: string | null;
  pendingGenerationJobId: string | null;
};

export type ShellGenerationJobInput = {
  id: string;
  status: string;
  progress: {
    percent?: number;
    stage?: string | null;
    label?: string | null;
  } | null;
};

export type ShellGenerationStatus = {
  jobId: string;
  kind: ShellGenerationKind;
  label: string;
  subline: string | null;
  percent: number | null;
  href: string;
  ariaLabel: string;
};

function draftsHref(jobId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}/drafts`;
}

function draftsReady(jobId: string): ShellGenerationStatus {
  return {
    jobId,
    kind: "drafts_ready",
    label: "Drafts ready",
    subline: "Open to review",
    percent: null,
    href: draftsHref(jobId),
    ariaLabel: "Drafts ready, open review",
  };
}

function generatingSubline(
  progress: ShellGenerationJobInput["progress"],
): string {
  const stage =
    progress?.label?.trim() ||
    friendlyStageHeadline(progress?.stage ?? null);
  const pct =
    typeof progress?.percent === "number" && Number.isFinite(progress.percent)
      ? Math.round(Math.min(100, Math.max(0, progress.percent)))
      : null;
  if (pct == null) return stage;
  return `${stage} · ${pct}%`;
}

/**
 * Pick one chrome status from journey (+ optional job poll for pending).
 * Priority: open review > pending failed > pending queued/running >
 * pending terminal non-failed (journey lag → drafts_ready).
 */
export function resolveShellGenerationStatus(
  journey: ShellGenerationJourneyInput,
  pendingJob: ShellGenerationJobInput | null = null,
): ShellGenerationStatus | null {
  if (journey.openReviewJobId) {
    return draftsReady(journey.openReviewJobId);
  }

  const pendingId = journey.pendingGenerationJobId;
  if (!pendingId) return null;

  // No job payload yet (fetch in flight or failed): do not invent "running".
  if (!pendingJob || pendingJob.id !== pendingId) {
    return null;
  }

  const status = pendingJob.status;
  if (status === "failed") {
    return {
      jobId: pendingId,
      kind: "failed",
      label: "Generation failed",
      subline: "Tap to open and retry",
      percent: null,
      href: draftsHref(pendingId),
      ariaLabel: "Generation failed, open details",
    };
  }

  if (status === "queued" || status === "running") {
    const progress = pendingJob.progress;
    const percent =
      typeof progress?.percent === "number" && Number.isFinite(progress.percent)
        ? Math.round(Math.min(100, Math.max(0, progress.percent)))
        : null;
    const subline =
      status === "queued" ? "Queued" : generatingSubline(progress);
    const ariaPct = percent != null ? `, ${percent} percent` : "";
    return {
      jobId: pendingId,
      kind: "generating",
      label: "Generating…",
      subline,
      percent: status === "running" ? percent : null,
      href: draftsHref(pendingId),
      ariaLabel: `Generating${ariaPct}, open progress`,
    };
  }

  // Journey still lists this as pending, but the job already settled OK
  // (needs_review / done). Keep chrome visible until openReview catches up.
  if (status === "needs_review" || status === "done") {
    return draftsReady(pendingId);
  }

  return null;
}
