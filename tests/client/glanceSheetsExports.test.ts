import { describe, expect, it } from "vitest";
import {
  BandSheetPanel,
  BodyCoursePanel,
  CiteSup,
  GlanceFact,
  TaxonomyTreeCard,
} from "../../src/atlas/glanceSheets";

describe("glanceSheets barrel exports", () => {
  it("re-exports presentational panels as functions", () => {
    expect(typeof CiteSup).toBe("function");
    expect(typeof GlanceFact).toBe("function");
    expect(typeof BandSheetPanel).toBe("function");
    expect(typeof BodyCoursePanel).toBe("function");
    expect(typeof TaxonomyTreeCard).toBe("function");
  });
});
