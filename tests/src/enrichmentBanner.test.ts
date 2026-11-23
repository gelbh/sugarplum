import { describe, expect, it } from "vitest";
import { shouldShowEnrichmentBanner } from "../../src/draftReview/enrichmentBannerVisibility";

describe("shouldShowEnrichmentBanner", () => {
  it("shows banner only for needs_review + enrich", () => {
    expect(
      shouldShowEnrichmentBanner({ jobStatus: "needs_review", stage: "enrich" }),
    ).toBe(true);
    expect(
      shouldShowEnrichmentBanner({ jobStatus: "needs_review", stage: "persist" }),
    ).toBe(false);
  });

  it("hides when enrich current has reached total", () => {
    expect(
      shouldShowEnrichmentBanner({
        jobStatus: "needs_review",
        stage: "enrich",
        current: 1,
        total: 1,
      }),
    ).toBe(false);
  });

  it("hides for other statuses even when stage is enrich", () => {
    expect(
      shouldShowEnrichmentBanner({ jobStatus: "running", stage: "enrich" }),
    ).toBe(false);
    expect(
      shouldShowEnrichmentBanner({ jobStatus: null, stage: "enrich" }),
    ).toBe(false);
  });
});
