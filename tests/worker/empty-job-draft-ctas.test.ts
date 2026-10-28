import { describe, expect, it } from "vitest";
import { emptyJobDraftCtas } from "../../src/journey/emptyJobDraftCtas";

describe("emptyJobDraftCtas", () => {
  it("primary Start study when dueCount > 0 and no sibling", () => {
    expect(
      emptyJobDraftCtas({
        jobId: "job-a",
        openReviewJobId: null,
        dueCount: 3,
      }),
    ).toEqual({
      primary: { label: "Start study", href: "/study" },
      otherDrafts: null,
    });
  });

  it("primary Go to Today when dueCount is 0", () => {
    expect(
      emptyJobDraftCtas({
        jobId: "job-a",
        openReviewJobId: null,
        dueCount: 0,
      }).primary,
    ).toEqual({ label: "Go to Today", href: "/today" });
  });

  it("secondary Review other drafts when openReviewJobId differs", () => {
    expect(
      emptyJobDraftCtas({
        jobId: "job-a",
        openReviewJobId: "job-b",
        dueCount: 2,
      }).otherDrafts,
    ).toEqual({
      label: "Review other drafts",
      href: "/jobs/job-b/drafts",
    });
  });

  it("omits secondary when openReviewJobId equals this job", () => {
    expect(
      emptyJobDraftCtas({
        jobId: "job-a",
        openReviewJobId: "job-a",
        dueCount: 1,
      }).otherDrafts,
    ).toBeNull();
  });
});
