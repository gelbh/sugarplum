import { describe, expect, it } from "vitest";
import { formatStrugglingCaption } from "../../src/study/session/StrugglingList";
import { GRADE_LABELS } from "../../src/study/grading/gradeLabels";

describe("formatStrugglingCaption", () => {
  it("includes No Idea, Tough Cookie, and Lapses", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 1,
        hard_14d: 2,
        lapses: 0,
      }),
    ).toBe(
      `${GRADE_LABELS[1]} (14d): 1 · ${GRADE_LABELS[2]} (14d): 2 · Lapses: 0`,
    );
  });

  it("appends R% when retrievability is known", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 1,
        hard_14d: 0,
        lapses: 1,
        retrievability: 0.84,
      }),
    ).toBe(
      `${GRADE_LABELS[1]} (14d): 1 · ${GRADE_LABELS[2]} (14d): 0 · Lapses: 1 · R: 84%`,
    );
  });

  it("omits R when retrievability is null or missing", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 0,
        hard_14d: 2,
        lapses: 0,
        retrievability: null,
      }),
    ).toBe(
      `${GRADE_LABELS[1]} (14d): 0 · ${GRADE_LABELS[2]} (14d): 2 · Lapses: 0`,
    );
  });
});
