import { describe, expect, it } from "vitest";
import {
  JOB_POLL_RUNNING_TIMEOUT_MS,
  advanceJobPollDeadline,
  resolveJobPollHeartbeatMs,
} from "../../src/progress/jobPollDeadline";

describe("resolveJobPollHeartbeatMs", () => {
  it("prefers updated_at over events and created_at", () => {
    const ms = resolveJobPollHeartbeatMs({
      updatedAt: "2026-01-01T00:20:00.000Z",
      events: [{ at: "2026-01-01T00:10:00.000Z" }],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(ms).toBe(Date.parse("2026-01-01T00:20:00.000Z"));
  });

  it("falls back to newest event then created_at", () => {
    expect(
      resolveJobPollHeartbeatMs({
        events: [
          { at: "2026-01-01T00:05:00.000Z" },
          { at: "2026-01-01T00:15:00.000Z" },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-01-01T00:15:00.000Z"));
    expect(
      resolveJobPollHeartbeatMs({
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
  });
});

describe("advanceJobPollDeadline", () => {
  it("never times out while queued even after a long wall clock", () => {
    const t0 = 1_000_000;
    const r = advanceJobPollDeadline({
      status: "queued",
      heartbeatMs: t0,
      nowMs: t0 + JOB_POLL_RUNNING_TIMEOUT_MS * 3,
    });
    expect(r.timedOut).toBe(false);
  });

  it("does not time out while running with a fresh heartbeat", () => {
    const heartbeat = 5_000_000;
    const r = advanceJobPollDeadline({
      status: "running",
      heartbeatMs: heartbeat,
      nowMs: heartbeat + JOB_POLL_RUNNING_TIMEOUT_MS - 1,
    });
    expect(r.timedOut).toBe(false);
  });

  it("times out when the heartbeat is older than the stale window", () => {
    const heartbeat = 5_000_000;
    const r = advanceJobPollDeadline({
      status: "running",
      heartbeatMs: heartbeat,
      nowMs: heartbeat + JOB_POLL_RUNNING_TIMEOUT_MS,
    });
    expect(r.timedOut).toBe(true);
  });

  it("extends life when the heartbeat advances (long healthy run)", () => {
    const started = 5_000_000;
    const later = started + JOB_POLL_RUNNING_TIMEOUT_MS + 60_000;
    const r = advanceJobPollDeadline({
      status: "running",
      heartbeatMs: later,
      nowMs: later + 1_000,
    });
    expect(r.timedOut).toBe(false);
  });
});
