import { describe, expect, it } from "vitest";
import {
  addGrade,
  emptyTally,
  gradedTotal,
  sessionSurface,
} from "../../../../src/study/session/sessionTally";

describe("session tally", () => {
  it("counts each rating once", () => {
    let tally = emptyTally();
    tally = addGrade(tally, 1);
    tally = addGrade(tally, 2);
    tally = addGrade(tally, 3);
    tally = addGrade(tally, 3);
    tally = addGrade(tally, 4);
    expect(tally).toEqual({ again: 1, hard: 1, good: 2, easy: 1 });
    expect(gradedTotal(tally)).toBe(5);
  });

  it("names the end screen from hadCards, grades, and pending learning", () => {
    expect(sessionSurface(false, 0, 0)).toBe("fresh");
    expect(sessionSurface(false, 2, 0)).toBe("fresh");
    expect(sessionSurface(true, 0, 0)).toBe("quiet");
    expect(sessionSurface(true, 1, 0)).toBe("complete");
    expect(sessionSurface(true, 3, 2)).toBe("soft_wait");
  });
});
