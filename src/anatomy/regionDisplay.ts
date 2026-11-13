import type { AnatomyRegion } from "./types";

export type RegionDisplay = {
  region: AnatomyRegion;
  family: string;
  short: string;
};

export const FAMILY_ORDER = ["Legs", "Head", "Trunk", "Other"] as const;

export function regionFamilyKey(id: string): string {
  if (id.startsWith("legs-")) return "Legs";
  if (id === "skull" || id === "neck") return "Head";
  if (
    id === "spine" ||
    id === "ribs" ||
    id === "organs" ||
    id === "pelvis-tail"
  ) {
    return "Trunk";
  }
  return "Other";
}

export function parseRegionDisplay(region: AnatomyRegion): RegionDisplay {
  const sep = " · ";
  const i = region.label.indexOf(sep);
  if (i !== -1) {
    return {
      region,
      family: region.label.slice(0, i),
      short: region.label.slice(i + sep.length),
    };
  }
  return {
    region,
    family: regionFamilyKey(region.id),
    short: region.label,
  };
}

export function groupRegionsByFamily(
  regions: AnatomyRegion[],
): { family: string; items: RegionDisplay[] }[] {
  const displays = regions.map(parseRegionDisplay);
  const byFamily = new Map<string, RegionDisplay[]>();
  for (const d of displays) {
    const list = byFamily.get(d.family) ?? [];
    list.push(d);
    byFamily.set(d.family, list);
  }
  const ordered: string[] = FAMILY_ORDER.filter((f) => byFamily.has(f));
  for (const key of byFamily.keys()) {
    if (!ordered.includes(key)) {
      ordered.push(key);
    }
  }
  return ordered.map((family) => ({
    family,
    items: byFamily.get(family)!,
  }));
}
