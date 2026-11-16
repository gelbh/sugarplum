import type { AnatomyRegion } from "./types";

export type RegionDisplay = {
  region: AnatomyRegion;
  family: string;
  short: string;
};

export const FAMILY_ORDER = [
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
] as const;

/** Keyword → family for IVALA mega region ids (first match wins). */
const FAMILY_RULES: { family: string; test: (id: string) => boolean }[] = [
  {
    family: "Skeleton",
    test: (id) =>
      id === "skeleton" ||
      id.endsWith("-bones") ||
      id.includes("bony-landmark") ||
      id === "foramina-and-teeth" ||
      id === "stifle",
  },
  {
    family: "Muscles",
    test: (id) =>
      id === "muscles" ||
      id.includes("musculature") ||
      id.includes("ecorche") ||
      id === "eye-muscles" ||
      id === "body-wall-musculature" ||
      id === "skull-muscles" ||
      id === "surface",
  },
  {
    family: "Nerves",
    test: (id) =>
      id.includes("nerve") ||
      id.includes("plexus") ||
      id.includes("autonomic") ||
      id.includes("dental-nerve"),
  },
  {
    family: "Vessels",
    test: (id) =>
      id.includes("vasculature") ||
      id.includes("arter") ||
      id.includes("vein") ||
      id.includes("venous"),
  },
  {
    family: "Organs",
    test: (id) =>
      id === "organs" ||
      id.includes("organ") ||
      id.includes("heart") ||
      id.includes("lung") ||
      id.includes("liver") ||
      id.includes("kidney") ||
      id.includes("bronchial") ||
      id.includes("urogenital") ||
      id === "larynx" ||
      id === "vulva" ||
      id === "hemithorax" ||
      id === "hemisection-scan" ||
      id === "abdo-radiography" ||
      id === "eye-schematic" ||
      id === "middle-and-inner-ear" ||
      id.includes("brain"),
  },
  {
    family: "Limbs",
    test: (id) =>
      id.includes("forelimb") ||
      id.includes("hindlimb") ||
      id.includes("limb"),
  },
  {
    family: "Skull",
    test: (id) => id.includes("skull") && id !== "skull",
  },
  {
    family: "Spine",
    test: (id) => id.includes("spine") && id !== "spine",
  },
  // VT osteology region ids (exact)
  {
    family: "Legs",
    test: (id) => id.startsWith("legs-"),
  },
  {
    family: "Head",
    test: (id) => id === "skull" || id === "neck",
  },
  {
    family: "Trunk",
    test: (id) => id === "spine" || id === "ribs" || id === "pelvis-tail",
  },
];

export function regionFamilyKey(id: string): string {
  const lower = id.toLowerCase();
  for (const rule of FAMILY_RULES) {
    if (rule.test(lower)) return rule.family;
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
