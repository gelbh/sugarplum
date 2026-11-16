import { describe, expect, it } from "vitest";
import { buildJobProgressSnapshot } from "../../src/progress/jobSnapshot";
import { formatProgressSubline } from "../../src/progress/copy";

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
    });
    expect(snap.stage).toBe("queued");
    expect(snap.label).toBe("Waiting to start");
  });

  it("does not use Waiting to start for running + null progress", () => {
    const snap = buildJobProgressSnapshot("j1", "running", null);
    expect(snap.label).not.toBe("Waiting to start");
    expect(snap.mode).toBe("indeterminate");
  });

  it("does not treat claim-heartbeat stage queued as in-line wait", () => {
    const snap = buildJobProgressSnapshot("j1", "running", {
      stage: "queued",
      current: 0,
      total: 0,
      percent: 0,
      label: "x",
    });
    expect(snap.stage).not.toBe("queued");
    expect(snap.label).not.toBe("Waiting to start");
    expect(formatProgressSubline({ stage: snap.stage, etaMs: null })).not.toBe(
      "You'll start when a worker is free",
    );
  });

  it("uses weighted percent as a determinate bar even when total is 0", () => {
    const snap = buildJobProgressSnapshot("j1", "running", {
      stage: "figures",
      current: 0,
      total: 0,
      percent: 18,
      label: "Detecting figures…",
    });
    expect(snap.mode).toBe("determinate");
    expect(snap.percent).toBe(18);
    expect(snap.stage).toBe("figures");
  });
});
