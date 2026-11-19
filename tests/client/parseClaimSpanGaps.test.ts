import { describe, expect, it } from "vitest";
import { parseClaimSpanGaps } from "../../src/draftReview/parseClaimSpanGaps";

describe("parseClaimSpanGaps", () => {
  it("returns gaps from claim_span", () => {
    expect(
      parseClaimSpanGaps(
        JSON.stringify({
          covered: [],
          gaps: [],
          draft_count: 0,
          claim_span: {
            covered_units: [],
            gaps: ["Cells make ATP in the mitochondria."],
            claim_count: 1,
            gap_extract_passes: 1,
          },
        }),
      ),
    ).toEqual(["Cells make ATP in the mitochondria."]);
  });

  it("returns empty for legacy coverage_json", () => {
    expect(
      parseClaimSpanGaps(
        JSON.stringify({ covered: ["a"], gaps: ["b"], draft_count: 1 }),
      ),
    ).toEqual([]);
  });

  it("returns empty for null or invalid JSON", () => {
    expect(parseClaimSpanGaps(null)).toEqual([]);
    expect(parseClaimSpanGaps("{")).toEqual([]);
  });
});
