import { describe, expect, it } from "vitest";
import type { AnatomyRegion } from "../../../src/anatomy/types";
import {
  FAMILY_ORDER,
  groupRegionsByFamily,
  parseRegionDisplay,
  regionFamilyKey,
} from "../../../src/anatomy/structure/regionDisplay";

function region(id: string, label: string): AnatomyRegion {
  return { id, label };
}

describe("regionFamilyKey", () => {
  it("maps IVALA and VT ids to families", () => {
    expect(regionFamilyKey("skeleton")).toBe("Skeleton");
    expect(regionFamilyKey("muscles")).toBe("Muscles");
    expect(regionFamilyKey("organs")).toBe("Organs");
    expect(regionFamilyKey("brachial-plexus")).toBe("Nerves");
    expect(regionFamilyKey("legs-front")).toBe("Legs");
    expect(regionFamilyKey("skull")).toBe("Head");
    expect(regionFamilyKey("neck")).toBe("Head");
    expect(regionFamilyKey("spine")).toBe("Trunk");
    expect(regionFamilyKey("ribs")).toBe("Trunk");
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
      region("organs", "Organs · Viscera"),
      region("legs-front", "Legs · Front"),
      region("custom-a", "Custom · A"),
      region("skull", "Head · Skull"),
      region("skeleton", "Skeleton · Full"),
    ]);
    expect(groups.map((g) => g.family)).toEqual([
      "Skeleton",
      "Organs",
      "Legs",
      "Head",
      "Custom",
    ]);
    expect(FAMILY_ORDER).toEqual([
      "Skeleton",
      "Muscles",
      "Organs",
      "Nerves",
      "Vessels",
      "Limbs",
      "Skull",
      "Spine",
      "Legs",
      "Head",
      "Trunk",
      "Other",
    ]);
    expect(groups[0].items.map((d) => d.region.id)).toEqual(["skeleton"]);
  });
});
