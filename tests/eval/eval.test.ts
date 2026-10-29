import { describe, expect, it } from "vitest";
import { runEvalCase, listEvalCaseIds } from "./runCase";

describe("grounded eval fixtures", () => {
  it("discovers fixture directories", () => {
    const ids = listEvalCaseIds();
    expect(ids).toEqual(
      expect.arrayContaining([
        "lecture-table-junk",
        "clean-glossary",
        "grounded-paragraph",
      ]),
    );
  });

  for (const id of listEvalCaseIds()) {
    it(`passes case ${id}`, async () => {
      const report = await runEvalCase(id);
      expect(report.failures, report.failures.join("; ")).toEqual([]);
      expect(report.ok).toBe(true);
    });
  }
});
