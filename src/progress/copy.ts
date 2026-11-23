export const PROGRESS_STAGE_ORDER = [
  "queued",
  "extract",
  "figures",
  "rules",
  "claims",
  "generate",
  "critique",
  "persist",
  "enrich",
] as const;

const STAGE_HEADLINES: Record<(typeof PROGRESS_STAGE_ORDER)[number], string> = {
  queued: "Waiting to start",
  extract: "Reading your material",
  figures: "Looking at figures",
  rules: "Applying study rules",
  claims: "Finding study claims",
  generate: "Writing cards",
  critique: "Reviewing your cards",
  persist: "Saving your cards",
  enrich: "Filling coverage gaps",
};

const FALLBACK_HEADLINE = "Preparing your cards";

export function friendlyStageHeadline(
  stage: string | null | undefined,
): string {
  if (stage == null) return FALLBACK_HEADLINE;
  if (stage in STAGE_HEADLINES) {
    return STAGE_HEADLINES[stage as keyof typeof STAGE_HEADLINES];
  }
  return FALLBACK_HEADLINE;
}

const STAGE_CHIP_LABELS: Record<(typeof PROGRESS_STAGE_ORDER)[number], string> =
  {
    queued: "Wait",
    extract: "Read",
    figures: "Figures",
    rules: "Rules",
    claims: "Claims",
    generate: "Write",
    critique: "Review",
    persist: "Save",
    enrich: "Enrich",
  };

export function shortStageChipLabel(stage: string): string {
  if (stage in STAGE_CHIP_LABELS) {
    return STAGE_CHIP_LABELS[stage as keyof typeof STAGE_CHIP_LABELS];
  }
  return stage;
}

/** Compact ETA for Studio meta row (`~52s`); null when unknown. */
export function formatEtaCompact(etaMs: number | null | undefined): string | null {
  if (etaMs == null) return null;
  return `~${fmtEtaCore(etaMs)}`;
}

export function orderPresentStages(present: readonly string[]): string[] {
  const set = new Set(present);
  return PROGRESS_STAGE_ORDER.filter((stage) => set.has(stage));
}

function fmtEtaCore(ms: number): string {
  if (ms <= 1000) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  // Coarsen above 2 minutes: nearest minute (avoid truncating ~59s low).
  if (s >= 120) {
    const mins = Math.max(2, Math.round(s / 60));
    return `${mins}m`;
  }
  if (m > 0) return `${m}m ${rem}s`;
  return `${rem}s`;
}

export function formatEtaSubline(etaMs: number | null | undefined): string {
  if (etaMs == null) return "Calculating…";
  return `About ${fmtEtaCore(etaMs)} left`;
}

/** Neutral wait copy: no queue-depth API, so do not claim another job is ahead. */
const QUEUED_SUBLINE = "You'll start when a worker is free";

/** Active stage with unknown ETA: honest wait, not "Calculating…". */
const ACTIVE_WAIT_SUBLINE = "Still working…";

export function formatProgressSubline(args: {
  stage?: string | null;
  etaMs?: number | null;
}): string {
  if (args.stage === "queued") return QUEUED_SUBLINE;
  if (args.etaMs == null) {
    if (args.stage && args.stage !== "queued") return ACTIVE_WAIT_SUBLINE;
    return "Calculating…";
  }
  return formatEtaSubline(args.etaMs);
}

export function formatRelativeAge(ageMs: number): string {
  if (ageMs < 1000) return "just now";
  return `${Math.round(ageMs / 1000)}s ago`;
}

export type ProgressDetailsModel = {
  sectionLine: string | null;
  jobLine: string | null;
  tokensLine: string | null;
  freeJobsLine: string | null;
};

export function progressDetailsModel(snapshot: {
  current?: number;
  total?: number;
  draftsSoFar?: number;
  projectedCards?: number | null;
  projectedTokens?: number | null;
  tokensUsed?: number;
  freeQuota?: { remaining: number } | null;
}): ProgressDetailsModel {
  const total = snapshot.total ?? 0;
  const current = snapshot.current;
  const sectionLine =
    total > 0 && current != null && current >= 1
      ? `Section ${Math.min(total, current)} of ${total}`
      : null;

  let jobLine: string | null = null;
  if ((snapshot.draftsSoFar ?? 0) > 0) {
    const drafts = snapshot.draftsSoFar!;
    jobLine =
      snapshot.projectedCards != null
        ? `${drafts} cards drafted · ~${Math.round(snapshot.projectedCards)} expected`
        : `${drafts} cards drafted`;
  }

  let tokensLine: string | null = null;
  if (
    snapshot.projectedTokens != null &&
    Number.isFinite(snapshot.projectedTokens)
  ) {
    tokensLine = `~${Math.round(snapshot.projectedTokens)} tokens expected`;
  } else if (
    snapshot.tokensUsed != null &&
    Number.isFinite(snapshot.tokensUsed)
  ) {
    tokensLine = `${Math.round(snapshot.tokensUsed)} tokens`;
  }

  const freeJobsLine =
    snapshot.freeQuota != null
      ? `${snapshot.freeQuota.remaining} free jobs left`
      : null;

  return { sectionLine, jobLine, tokensLine, freeJobsLine };
}
