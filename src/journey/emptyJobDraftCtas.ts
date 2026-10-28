import {
  studyPrimaryCta,
  type StudyPrimaryCta,
} from "./studyPrimaryCta";

export type EmptyJobDraftCtas = {
  primary: StudyPrimaryCta;
  otherDrafts: { label: "Review other drafts"; href: string } | null;
};

export function emptyJobDraftCtas(args: {
  jobId: string;
  openReviewJobId: string | null;
  dueCount: number;
}): EmptyJobDraftCtas {
  const sibling =
    args.openReviewJobId != null && args.openReviewJobId !== args.jobId
      ? args.openReviewJobId
      : null;

  return {
    primary: studyPrimaryCta(args.dueCount),
    otherDrafts: sibling
      ? {
          label: "Review other drafts",
          href: `/jobs/${encodeURIComponent(sibling)}/drafts`,
        }
      : null,
  };
}
