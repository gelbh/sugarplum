export function shellGenerationPollMs(args: {
  visibility: DocumentVisibilityState;
  openReviewJobId: string | null;
  pendingGenerationJobId: string | null;
}): number {
  if (args.visibility === "hidden") return 30_000;
  if (args.pendingGenerationJobId && !args.openReviewJobId) return 5_000;
  if (args.openReviewJobId) return 30_000;
  return 60_000;
}
