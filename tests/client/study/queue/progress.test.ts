import { describe, expect, it } from "vitest";
import { studyQueueProgress } from "../../../../src/study/queue/studyQueueProgress";

describe("studyQueueProgress", () => {
  it("returns 0 when the queue total is empty", () => {
    expect(studyQueueProgress(0, 0)).toBe(0);
  });

  it("starts empty when every card is still in the queue", () => {
    expect(studyQueueProgress(10, 10)).toBe(0);
  });

  it("fills by the share of cards that have left", () => {
    expect(studyQueueProgress(10, 9)).toBe(10);
  });

  it("clamps a remaining count above the total back to empty", () => {
    expect(studyQueueProgress(10, 12)).toBe(0);
  });

  it("clamps a negative remaining count to full", () => {
    expect(studyQueueProgress(10, -1)).toBe(100);
  });
});
