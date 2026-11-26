import { describe, expect, it } from "vitest";
import { studyCap } from "../../../src/calendar/gaps";

const day = "2026-11-06";

describe("studyCap", () => {
  it("caps a 20 minute gap at 40 cards and skips a short queue", () => {
    const busy = [{ start: `${day}T10:00:00.000Z`, end: `${day}T11:00:00.000Z` }];
    const now = `${day}T09:40:00.000Z`;
    expect(studyCap({ now, busy, queueLength: 80 })).toEqual({
      cap: 40,
      stretch: { start: now, end: busy[0].start },
    });
    expect(studyCap({ now, busy, queueLength: 10 }).cap).toBeNull();
  });

  it("uses the next stretch when now is busy", () => {
    const busy = [
      { start: `${day}T10:00:00.000Z`, end: `${day}T11:00:00.000Z` },
      { start: `${day}T11:50:00.000Z`, end: `${day}T12:00:00.000Z` },
    ];
    const now = `${day}T10:30:00.000Z`;
    const result = studyCap({ now, busy, queueLength: 200 });
    expect(result.cap).toBe(100);
    expect(result.stretch).toEqual({
      start: `${day}T11:00:00.000Z`,
      end: `${day}T11:50:00.000Z`,
    });
  });

  it("skips a 4 minute gap", () => {
    const busy = [{ start: `${day}T10:00:00.000Z`, end: `${day}T11:00:00.000Z` }];
    const now = `${day}T09:56:00.000Z`;
    const result = studyCap({ now, busy, queueLength: 500 });
    expect(result.stretch?.start).toBe(`${day}T11:00:00.000Z`);
    expect(result.cap).not.toBe(8);
  });

  it("returns no cap when the horizon is entirely busy", () => {
    const now = `${day}T09:00:00.000Z`;
    const end = new Date(Date.parse(now) + 36 * 60 * 60 * 1000).toISOString();
    expect(
      studyCap({
        now,
        busy: [{ start: now, end }],
        queueLength: 20,
      }),
    ).toEqual({ cap: null, stretch: null });
  });
});
