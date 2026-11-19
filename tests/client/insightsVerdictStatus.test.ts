import { describe, expect, it } from "vitest";
import { insightsVerdictStatus } from "../../src/insights/verdictStatus";

describe("insightsVerdictStatus", () => {
  it("marks on track when retention meets target", () => {
    expect(insightsVerdictStatus(82, 80)?.kind).toBe("on_track");
  });

  it("marks below when retention is under target", () => {
    expect(insightsVerdictStatus(70, 80)?.kind).toBe("below_target");
  });

  it("is unknown without target or retention", () => {
    expect(insightsVerdictStatus(null, 80)).toBeNull();
    expect(insightsVerdictStatus(82, null)).toBeNull();
  });
});
