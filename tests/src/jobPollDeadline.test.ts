import { describe, expect, it } from "vitest";
import {
  JOB_POLL_RUNNING_TIMEOUT_MS,
  advanceJobPollDeadline,
} from "../../src/progress/jobPollDeadline";

describe("advanceJobPollDeadline", () => {
  it("never times out while queued even after a long wall clock", () => {
    const t0 = 1_000_000;
    const r = advanceJobPollDeadline({
      status: "queued",
      runningDeadlineMs: null,
      nowMs: t0 + JOB_POLL_RUNNING_TIMEOUT_MS * 3,
    });
    expect(r.timedOut).toBe(false);
    expect(r.runningDeadlineMs).toBeNull();
  });

  it("starts the running budget on first running observation", () => {
    const now = 5_000_000;
    const r = advanceJobPollDeadline({
      status: "running",
      runningDeadlineMs: null,
      nowMs: now,
    });
    expect(r.timedOut).toBe(false);
    expect(r.runningDeadlineMs).toBe(now + JOB_POLL_RUNNING_TIMEOUT_MS);
  });

  it("times out after the running budget elapses", () => {
    const started = 5_000_000;
    const deadline = started + JOB_POLL_RUNNING_TIMEOUT_MS;
    const r = advanceJobPollDeadline({
      status: "running",
      runningDeadlineMs: deadline,
      nowMs: deadline,
    });
    expect(r.timedOut).toBe(true);
    expect(r.runningDeadlineMs).toBe(deadline);
  });

  it("clears a running deadline when status returns to queued", () => {
    const r = advanceJobPollDeadline({
      status: "queued",
      runningDeadlineMs: 9_999_999,
      nowMs: 1,
    });
    expect(r.runningDeadlineMs).toBeNull();
    expect(r.timedOut).toBe(false);
  });
});
