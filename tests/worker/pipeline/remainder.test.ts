import { describe, expect, it } from "vitest";
import { remainderAfterRules } from "../../../worker/generation/pipeline";
import { harvestRuleDrafts } from "../../../worker/generation/rules";

describe("remainderAfterRules", () => {
  it("strips harvested lines by provenance excerpt so caller can pipeline the rest", () => {
    const text = [
      "What is ATP :: Adenosine triphosphate",
      "The mitochondria produces ATP in eukaryotic cells.",
      "glycolysis - breakdown of glucose",
    ].join("\n");

    const rules = harvestRuleDrafts(text);
    expect(rules).toHaveLength(2);

    const remainder = remainderAfterRules(text, rules);
    expect(remainder).toContain("The mitochondria produces ATP");
    expect(remainder).not.toContain("What is ATP ::");
    expect(remainder).not.toContain("glycolysis - breakdown");
  });
});
