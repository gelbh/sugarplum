import { describe, it, expect } from "vitest";
import {
  resolveShellGenerationStatus,
  type ShellGenerationJobInput,
  type ShellGenerationJourneyInput,
} from "../../src/shell/resolveShellGenerationStatus";

function journey(
  overrides: Partial<ShellGenerationJourneyInput> = {},
): ShellGenerationJourneyInput {
  return {
    openReviewJobId: null,
    pendingGenerationJobId: null,
    ...overrides,
  };
}

function job(
  overrides: Partial<ShellGenerationJobInput> & { id: string },
): ShellGenerationJobInput {
  return {
    status: "running",
    progress: null,
    ...overrides,
  };
}

describe("resolveShellGenerationStatus", () => {
  it("returns null when both ids are null", () => {
    expect(resolveShellGenerationStatus(journey())).toBeNull();
  });

  it("prefers open review over pending generating", () => {
    const status = resolveShellGenerationStatus(
      journey({
        openReviewJobId: "review-1",
        pendingGenerationJobId: "run-1",
      }),
      job({ id: "run-1", status: "running", progress: { percent: 40 } }),
    );
    expect(status).toMatchObject({
      jobId: "review-1",
      kind: "drafts_ready",
      label: "Drafts ready",
      href: "/jobs/review-1/drafts",
    });
  });

  it("maps pending failed", () => {
    const status = resolveShellGenerationStatus(
      journey({ pendingGenerationJobId: "fail-1" }),
      job({ id: "fail-1", status: "failed" }),
    );
    expect(status).toMatchObject({
      jobId: "fail-1",
      kind: "failed",
      label: "Generation failed",
      href: "/jobs/fail-1/drafts",
    });
  });

  it("maps queued/running to generating with percent", () => {
    const status = resolveShellGenerationStatus(
      journey({ pendingGenerationJobId: "run-2" }),
      job({
        id: "run-2",
        status: "running",
        progress: { percent: 42, stage: "generate", label: "Writing cards" },
      }),
    );
    expect(status).toMatchObject({
      jobId: "run-2",
      kind: "generating",
      label: "Generating…",
      href: "/jobs/run-2/drafts",
      percent: 42,
    });
    expect(status?.subline).toMatch(/42%/);
  });

  it("encodes job id in href", () => {
    const status = resolveShellGenerationStatus(
      journey({ openReviewJobId: "id/with spaces" }),
    );
    expect(status?.href).toBe(
      `/jobs/${encodeURIComponent("id/with spaces")}/drafts`,
    );
  });

  it("does not invent generating when pending id has no job payload", () => {
    expect(
      resolveShellGenerationStatus(
        journey({ pendingGenerationJobId: "run-3" }),
        null,
      ),
    ).toBeNull();
  });

  it("maps terminal needs_review while journey still pending to drafts_ready", () => {
    const status = resolveShellGenerationStatus(
      journey({ pendingGenerationJobId: "done-1" }),
      job({ id: "done-1", status: "needs_review" }),
    );
    expect(status).toMatchObject({
      jobId: "done-1",
      kind: "drafts_ready",
      href: "/jobs/done-1/drafts",
    });
  });

  it("maps done while journey still pending to drafts_ready", () => {
    const status = resolveShellGenerationStatus(
      journey({ pendingGenerationJobId: "done-2" }),
      job({ id: "done-2", status: "done" }),
    );
    expect(status).toMatchObject({
      jobId: "done-2",
      kind: "drafts_ready",
    });
  });
});
