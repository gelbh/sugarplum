import { describe, expect, it } from "vitest";
import type { AnatomyRegion } from "../../src/anatomy/types";
import {
  FAMILY_ORDER,
  groupRegionsByFamily,
  parseRegionDisplay,
  regionFamilyKey,
} from "../../src/anatomy/regionDisplay";

function region(id: string, label: string): AnatomyRegion {
  return { id, label };
}

describe("regionFamilyKey", () => {
  it("maps id prefixes to Legs Head Trunk Other", () => {
    expect(regionFamilyKey("legs-front")).toBe("Legs");
    expect(regionFamilyKey("skull")).toBe("Head");
    expect(regionFamilyKey("neck")).toBe("Head");
    expect(regionFamilyKey("spine")).toBe("Trunk");
    expect(regionFamilyKey("ribs")).toBe("Trunk");
    expect(regionFamilyKey("organs")).toBe("Trunk");
    expect(regionFamilyKey("pelvis-tail")).toBe("Trunk");
    expect(regionFamilyKey("mystery")).toBe("Other");
  });
});

describe("parseRegionDisplay", () => {
  it("splits label on middle-dot separator", () => {
    const d = parseRegionDisplay(region("legs-front", "Legs · Thoracic"));
    expect(d.family).toBe("Legs");
    expect(d.short).toBe("Thoracic");
  });

  it("falls back to id family when label has no separator", () => {
    const d = parseRegionDisplay(region("skull", "Skull"));
    expect(d.family).toBe("Head");
    expect(d.short).toBe("Skull");
  });
});

describe("groupRegionsByFamily", () => {
  it("orders by FAMILY_ORDER then appends unknown families", () => {
    const groups = groupRegionsByFamily([
      region("organs", "Trunk · Organs"),
      region("legs-front", "Legs · Front"),
      region("custom-a", "Custom · A"),
      region("skull", "Head · Skull"),
    ]);
    expect(groups.map((g) => g.family)).toEqual([
      "Legs",
      "Head",
      "Trunk",
      "Custom",
    ]);
    expect(FAMILY_ORDER).toEqual(["Legs", "Head", "Trunk", "Other"]);
    expect(groups[0].items.map((d) => d.region.id)).toEqual(["legs-front"]);
  });
});
