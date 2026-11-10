import { describe, expect, it } from "vitest";
import { buildDueHistogramFromDues } from "../../src/study/dueHistogram";

describe("buildDueHistogramFromDues", () => {
  it("buckets dues and counts backlog as dueToday", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const { dueCntPerDay, dueToday } = buildDueHistogramFromDues(
      [
        "2026-11-08T12:00:00.000Z",
        "2026-11-10T08:00:00.000Z",
        "2026-11-15T12:00:00.000Z",
        "2026-11-15T18:00:00.000Z",
      ],
      now,
      0,
    );
    expect(dueToday).toBe(2);
    expect(dueCntPerDay.get("2026-11-15")).toBe(2);
    expect(dueCntPerDay.get("2026-11-08")).toBe(1);
  });
});
