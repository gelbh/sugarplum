import { describe, expect, it } from "vitest";
import { jobIdFromPath } from "../../../src/draftReview/draftReviewPath";

describe("jobIdFromPath", () => {
  it("parses encoded job id from drafts route", () => {
    expect(jobIdFromPath("/jobs/abc%2Fdef/drafts")).toBe("abc/def");
    expect(jobIdFromPath("/jobs/plain-id/drafts/")).toBe("plain-id");
  });

  it("returns null when path is not a drafts route", () => {
    expect(jobIdFromPath("/library")).toBeNull();
    expect(jobIdFromPath("/jobs/only")).toBeNull();
  });

  it("returns null for malformed percent-encoding", () => {
    expect(jobIdFromPath("/jobs/%E0%A4%A/drafts")).toBeNull();
  });
});
