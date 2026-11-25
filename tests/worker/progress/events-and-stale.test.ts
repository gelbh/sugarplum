import { describe, expect, it } from "vitest";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  RUNNING_JOB_STALE_MS,
  isFreeGenCharged,
  isRunningJobStale,
  pushProgressEvent,
  truncateProgressText,
  withFreeGenCharged,
  withUpdatedAt,
} from "../../../worker/generation/progress";

describe("truncateProgressText", () => {
  it("strips C0 control chars except newline and space, then slices", () => {
    const withControls = "hello\u0000\u0007world\nok\tthere";
    expect(truncateProgressText(withControls)).toBe("helloworld\nokthere");
    expect(truncateProgressText("a".repeat(200))).toBe("a".repeat(160));
    expect(truncateProgressText("short", 160)).toBe("short");
  });
});

describe("pushProgressEvent", () => {
  const sample = (i: number) => ({
    at: "2026-10-27T00:00:00.000Z",
    kind: "stage" as const,
    stage: "generate",
    text: `event ${i}`,
  });

  it("starts from empty when events undefined", () => {
    expect(pushProgressEvent(undefined, sample(1))).toEqual([sample(1)]);
  });

  it("drops oldest when exceeding max (default 12)", () => {
    let events: ReturnType<typeof sample>[] = [];
    for (let i = 0; i < 13; i++) {
      events = pushProgressEvent(events, sample(i));
    }
    expect(events).toHaveLength(12);
    expect(events[0].text).toBe("event 1");
    expect(events[11].text).toBe("event 12");
  });
});

describe("isRunningJobStale", () => {
  const createdAt = "2026-10-27T17:00:00.000Z";
  const createdMs = Date.parse(createdAt);

  it("is stale when only created_at is older than the threshold", () => {
    expect(
      isRunningJobStale(null, createdAt, createdMs + RUNNING_JOB_STALE_MS),
    ).toBe(true);
  });

  it("is fresh when updated_at is within the threshold", () => {
    const updatedAt = "2026-10-27T17:10:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS - 1;
    expect(
      isRunningJobStale(
        JSON.stringify({ updated_at: updatedAt }),
        createdAt,
        now,
      ),
    ).toBe(false);
  });

  it("uses the newest event at when updated_at is absent", () => {
    const eventAt = "2026-10-27T17:15:00.000Z";
    const now = Date.parse(eventAt) + RUNNING_JOB_STALE_MS - 1;
    expect(
      isRunningJobStale(
        JSON.stringify({
          events: [{ at: eventAt, kind: "excerpt", stage: "extract", text: "x" }],
        }),
        createdAt,
        now,
      ),
    ).toBe(false);
  });

  it("does not let a fresh created_at mask a stale updated_at", () => {
    const updatedAt = "2026-10-27T17:00:00.000Z";
    const freshCreated = "2026-10-27T18:00:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS;
    expect(
      isRunningJobStale(
        JSON.stringify({ updated_at: updatedAt }),
        freshCreated,
        now,
      ),
    ).toBe(true);
  });

  it("ignores newer events when updated_at is present", () => {
    const updatedAt = "2026-10-27T17:00:00.000Z";
    const eventAt = "2026-10-27T18:00:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS;
    expect(
      isRunningJobStale(
        JSON.stringify({
          updated_at: updatedAt,
          events: [{ at: eventAt, kind: "excerpt", stage: "extract", text: "x" }],
        }),
        createdAt,
        now,
      ),
    ).toBe(true);
  });

  it("withUpdatedAt sets heartbeat and preserves stage fields", () => {
    const next = JSON.parse(
      withUpdatedAt(
        JSON.stringify({
          stage: "figures",
          current: 2,
          total: 2,
          percent: 20,
          label: "Processing figures",
        }),
        "2026-10-27T19:00:00.000Z",
      ),
    );
    expect(next).toMatchObject({
      stage: "figures",
      current: 2,
      total: 2,
      percent: 20,
      label: "Processing figures",
      updated_at: "2026-10-27T19:00:00.000Z",
    });
  });

  it("withFreeGenCharged sets marker and isFreeGenCharged reads it", () => {
    expect(isFreeGenCharged(null)).toBe(false);
    expect(isFreeGenCharged('{"stage":"extract"}')).toBe(false);
    const next = JSON.parse(
      withFreeGenCharged(
        JSON.stringify({
          stage: "extract",
          current: 0,
          total: 0,
          percent: 5,
          label: "Extracting material",
        }),
      ),
    );
    expect(next.free_gen_charged).toBe(true);
    expect(next.stage).toBe("extract");
    expect(isFreeGenCharged(JSON.stringify(next))).toBe(true);
  });

  it("queue retry constants span the stale window", () => {
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });
});
