export function shouldShowEnrichmentBanner(args: {
  jobStatus: string | null;
  stage: string | null | undefined;
  current?: number | null;
  total?: number | null;
}): boolean {
  if (args.jobStatus !== "needs_review" || args.stage !== "enrich") {
    return false;
  }
  if (
    typeof args.current === "number" &&
    typeof args.total === "number" &&
    args.total > 0 &&
    args.current >= args.total
  ) {
    return false;
  }
  return true;
}
