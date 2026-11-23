import { describe, expect, it } from "vitest";
import {
  friendlyStageHeadline,
  shortStageChipLabel,
  orderPresentStages,
  formatEtaSubline,
  formatProgressSubline,
  formatRelativeAge,
  progressDetailsModel,
} from "../../src/progress/copy";

describe("friendlyStageHeadline", () => {
  it("maps critique", () => {
    expect(friendlyStageHeadline("critique")).toBe("Reviewing your cards");
  });
  it("maps enrich", () => {
    expect(friendlyStageHeadline("enrich")).toBe("Filling coverage gaps");
  });
  it("falls back for unknown", () => {
    expect(friendlyStageHeadline("nope")).toBe("Preparing your cards");
  });
});

describe("shortStageChipLabel", () => {
  it("maps critique to Review and generate to Write", () => {
    expect(shortStageChipLabel("critique")).toBe("Review");
    expect(shortStageChipLabel("generate")).toBe("Write");
  });
  it("maps enrich to Enrich", () => {
    expect(shortStageChipLabel("enrich")).toBe("Enrich");
  });
  it("falls back to stage id for unknown", () => {
    expect(shortStageChipLabel("custom")).toBe("custom");
  });
});

describe("orderPresentStages", () => {
  it("orders by catalog not discovery", () => {
    expect(orderPresentStages(["critique", "extract", "generate"])).toEqual([
      "extract",
      "generate",
      "critique",
    ]);
  });
  it("places enrich after persist", () => {
    expect(
      orderPresentStages(["enrich", "persist", "generate", "critique"]),
    ).toEqual(["generate", "critique", "persist", "enrich"]);
  });
});

describe("formatEtaSubline", () => {
  it("Calculating when null", () => {
    expect(formatEtaSubline(null)).toBe("Calculating…");
  });
  it("About Ns left", () => {
    expect(formatEtaSubline(52_000)).toBe("About 52s left");
  });
});

describe("formatProgressSubline", () => {
  it("uses neutral queued copy when stage is queued", () => {
    expect(formatProgressSubline({ stage: "queued", etaMs: null })).toBe(
      "You'll start when a worker is free",
    );
  });
  it("falls through to ETA otherwise", () => {
    expect(formatProgressSubline({ stage: "generate", etaMs: null })).toBe(
      "Calculating…",
    );
  });
});

describe("formatRelativeAge", () => {
  it("just now under 1s", () => {
    expect(formatRelativeAge(400)).toBe("just now");
  });
});

describe("progressDetailsModel", () => {
  it("uses 1-based section and free jobs wording", () => {
    const m = progressDetailsModel({
      current: 3,
      total: 3,
      draftsSoFar: 10,
      projectedCards: 120,
      projectedTokens: 40000,
      freeQuota: { remaining: 2 },
    });
    expect(m.sectionLine).toBe("Section 3 of 3");
    expect(m.freeJobsLine).toBe("2 free jobs left");
    expect(m.jobLine).toBe("10 cards drafted · ~120 expected");
    expect(m.tokensLine).toBe("~40000 tokens expected");
  });

  it("labels used tokens when no projection", () => {
    expect(
      progressDetailsModel({ tokensUsed: 1200, freeQuota: null }).tokensLine,
    ).toBe("1200 tokens");
  });

  it("omits section when current is below 1", () => {
    expect(
      progressDetailsModel({ current: 0, total: 1, freeQuota: null })
        .sectionLine,
    ).toBeNull();
  });

  it("omits free jobs when quota null", () => {
    expect(
      progressDetailsModel({ current: 1, total: 2, freeQuota: null })
        .freeJobsLine,
    ).toBeNull();
  });
});
