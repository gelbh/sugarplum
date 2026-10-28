export type EmptyJobDraftCtas = {
  primary: { label: "Start study" | "Go to Today"; href: "/study" | "/today" };
  otherDrafts: { label: "Review other drafts"; href: string } | null;
};

export function emptyJobDraftCtas(args: {
  jobId: string;
  openReviewJobId: string | null;
  dueCount: number;
}): EmptyJobDraftCtas {
  const primary =
    args.dueCount > 0
      ? ({ label: "Start study", href: "/study" } as const)
      : ({ label: "Go to Today", href: "/today" } as const);

  const sibling =
    args.openReviewJobId != null && args.openReviewJobId !== args.jobId
      ? args.openReviewJobId
      : null;

  return {
    primary,
    otherDrafts: sibling
      ? {
          label: "Review other drafts",
          href: `/jobs/${encodeURIComponent(sibling)}/drafts`,
        }
      : null,
  };
}
