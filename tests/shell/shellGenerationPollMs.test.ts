import { describe, expect, it } from "vitest";
import { shellGenerationPollMs } from "../../src/app/shell/shellGenerationPollMs";

describe("shellGenerationPollMs", () => {
  it("polls every 5s when pending generation and no open review", () => {
    expect(
      shellGenerationPollMs({
        visibility: "visible",
        openReviewJobId: null,
        pendingGenerationJobId: "j1",
      }),
    ).toBe(5_000);
  });

  it("polls every 30s when open review is set", () => {
    expect(
      shellGenerationPollMs({
        visibility: "visible",
        openReviewJobId: "j2",
        pendingGenerationJobId: null,
      }),
    ).toBe(30_000);
  });

  it("polls every 60s when idle", () => {
    expect(
      shellGenerationPollMs({
        visibility: "visible",
        openReviewJobId: null,
        pendingGenerationJobId: null,
      }),
    ).toBe(60_000);
  });

  it("polls every 30s when tab is hidden", () => {
    expect(
      shellGenerationPollMs({
        visibility: "hidden",
        openReviewJobId: null,
        pendingGenerationJobId: null,
      }),
    ).toBe(30_000);
  });
});
