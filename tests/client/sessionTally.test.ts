import { describe, expect, it } from "vitest";
import {
  addGrade,
  emptyTally,
  gradedTotal,
  sessionEndKind,
} from "../../src/study/sessionTally";

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

  it("names the end screen from hadCards and the graded total", () => {
    expect(sessionEndKind(false, 0)).toBe("fresh");
    expect(sessionEndKind(false, 2)).toBe("fresh");
    expect(sessionEndKind(true, 0)).toBe("quiet");
    expect(sessionEndKind(true, 1)).toBe("complete");
  });
});
