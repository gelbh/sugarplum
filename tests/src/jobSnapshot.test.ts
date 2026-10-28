import { describe, expect, it } from "vitest";
import { buildJobProgressSnapshot } from "../../src/progress/jobSnapshot";

describe("buildJobProgressSnapshot", () => {
  it("maps queued + null progress to Waiting to start", () => {
    const snap = buildJobProgressSnapshot("j1", "queued", null);
    expect(snap.label).toBe("Waiting to start");
    expect(snap.stage).toBe("queued");
    expect(snap.mode).toBe("indeterminate");
    expect(snap.percent).toBe(0);
    expect(snap.presentStages).toEqual(["queued"]);
  });

  it("keeps queued headline even if progress is present", () => {
    const snap = buildJobProgressSnapshot("j1", "queued", {
      stage: "extract",
      current: 0,
      total: 0,
      percent: 0,
      label: "x",
      updated_at: "2026-10-28T00:00:00.000Z",
    });
    expect(snap.stage).toBe("queued");
    expect(snap.label).toBe("Waiting to start");
  });

  it("does not use Waiting to start for running + null progress", () => {
    const snap = buildJobProgressSnapshot("j1", "running", null);
    expect(snap.label).not.toBe("Waiting to start");
    expect(snap.mode).toBe("indeterminate");
  });
});
