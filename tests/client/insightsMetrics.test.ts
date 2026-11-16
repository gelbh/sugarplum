import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  buildConsistency,
  buildDifficultyMix,
  buildGradeCountsByMaturity,
  buildStabilitySnapshot,
  buildTrueRetention,
  buildWorkloadFromDues,
} from "../../src/insights/buildMetrics";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const TZ = 0;

describe("buildTrueRetention", () => {
  it("keeps first review per card-day; Again is fail; mature at scheduled_days >= 21", () => {
    const out = buildTrueRetention(
      [
        {
          card_id: "a",
          reviewed_at: "2026-11-13T10:00:00.000Z",
          rating: 1,
          scheduled_days: 1,
          state: State.Review,
        },
        {
          card_id: "a",
          reviewed_at: "2026-11-13T11:00:00.000Z",
          rating: 3,
          scheduled_days: 3,
          state: State.Review,
        },
        {
          card_id: "b",
          reviewed_at: "2026-11-12T10:00:00.000Z",
          rating: 3,
          scheduled_days: 30,
          state: State.Review,
        },
      ],
      NOW,
      TZ,
    );
    expect(out.overall).toEqual({ pass: 1, fail: 1, rate: 0.5 });
    expect(out.young).toEqual({ pass: 0, fail: 1, rate: 0 });
    expect(out.mature).toEqual({ pass: 1, fail: 0, rate: 1 });
  });
});

describe("buildWorkloadFromDues", () => {
  it("splits due today / overdue and builds 14d future series; daily load 0.12", () => {
    const out = buildWorkloadFromDues(
      [
        "2026-11-13T08:00:00.000Z",
        "2026-11-10T08:00:00.000Z",
        "2026-11-14T08:00:00.000Z",
        "2026-11-20T08:00:00.000Z",
      ],
      NOW,
      TZ,
      [10, 50],
    );
    expect(out.dueToday).toBe(1);
    expect(out.overdue).toBe(1);
    expect(out.dailyLoad).toBe(0.12);
    expect(out.futureDue).toHaveLength(14);
    expect(out.futureDue[0]).toEqual({ day: "2026-11-14", count: 1 });
    expect(out.futureDue.find((d) => d.day === "2026-11-20")?.count).toBe(1);
  });
});

describe("buildConsistency", () => {
  it("counts active days and intensity over the series length", () => {
    const series = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      count: i < 10 ? 5 : 0,
    }));
    const out = buildConsistency(series);
    expect(out.activeDays).toBe(10);
    expect(out.intensity).toBeCloseTo(10 / 30);
    expect(out.score).toBeGreaterThan(0);
    expect(out.score).toBeLessThanOrEqual(1);
  });

  it("returns null score when there is no activity", () => {
    const series = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      count: 0,
    }));
    expect(buildConsistency(series).score).toBeNull();
  });
});

describe("buildDifficultyMix / buildStabilitySnapshot", () => {
  it("buckets difficulty edges and median stability", () => {
    expect(buildDifficultyMix([3.9, 4, 6.9, 7, null])).toEqual({
      easy: 1,
      medium: 2,
      hard: 1,
      total: 4,
    });
    const stab = buildStabilitySnapshot([0.5, 3, 10, 30, null, 0]);
    expect(stab.medianDays).toBe(6.5);
    expect(stab.bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });
});

describe("buildGradeCountsByMaturity", () => {
  it("routes Learning to learning; omits missing scheduled_days", () => {
    const out = buildGradeCountsByMaturity([
      { rating: 3, scheduled_days: 5, state: State.Review },
      { rating: 1, scheduled_days: 30, state: State.Review },
      { rating: 2, scheduled_days: 1, state: State.Learning },
      { rating: 4, scheduled_days: null, state: State.Review },
    ]);
    expect(out.young).toEqual({ again: 0, hard: 0, good: 1, easy: 0 });
    expect(out.mature).toEqual({ again: 1, hard: 0, good: 0, easy: 0 });
    expect(out.learning).toEqual({ again: 0, hard: 1, good: 0, easy: 0 });
  });
});
