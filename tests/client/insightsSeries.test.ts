import { describe, expect, it } from "vitest";
import {
  buildGradeCounts,
  buildReviewsPerDay,
  INSIGHTS_REVIEWS_DAYS,
} from "../../src/insights/buildSeries";

describe("buildReviewsPerDay", () => {
  it("zero-fills a 30-day window", () => {
    const now = new Date("2026-11-13T15:00:00.000Z");
    const series = buildReviewsPerDay([], now, 0);
    expect(series).toHaveLength(INSIGHTS_REVIEWS_DAYS);
    expect(series.every((p) => p.count === 0)).toBe(true);
    expect(series[series.length - 1]!.day).toBe("2026-11-13");
    expect(series[0]!.day).toBe("2026-10-15");
  });

  it("buckets reviews by local day key", () => {
    const now = new Date("2026-11-13T15:00:00.000Z");
    const series = buildReviewsPerDay(
      ["2026-11-13T01:00:00.000Z", "2026-11-13T20:00:00.000Z", "2026-11-12T12:00:00.000Z"],
      now,
      0,
    );
    expect(series.find((p) => p.day === "2026-11-13")!.count).toBe(2);
    expect(series.find((p) => p.day === "2026-11-12")!.count).toBe(1);
  });
});

describe("buildGradeCounts", () => {
  it("maps ratings 1–4 and ignores others", () => {
    expect(buildGradeCounts([1, 1, 2, 3, 4, 4, 9, 0])).toEqual({
      again: 2,
      hard: 1,
      good: 1,
      easy: 2,
    });
  });
});
