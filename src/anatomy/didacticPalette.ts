/**
 * Teaching colors for flat gray IVALA (and similar) GLBs.
 * Applied in the viewer after load: clone materials, tint by region / organ keyword.
 */

/** CSS hex by region id. Unknown regions fall back to hash. */
export const REGION_DIDACTIC_COLORS: Record<string, string> = {
  skeleton: "#e6d7b8",
  surface: "#c9a07a",
  ecorche: "#b14b4b",
  organs: "#c45c6a",
  skull: "#e6d7b8",
  neck: "#d8c4a4",
  spine: "#dccbb0",
  ribs: "#d4c09a",
  "pelvis-tail": "#d0b892",
  muscles: "#b14b4b",
  skin: "#c9a07a",
  // Distinct from skeleton bone albedo so Kabsch overlays read clearly.
  "brachial-plexus": "#e8c05e",
};

/** Keyword → hex; first case-insensitive substring match on node/label wins. */
const ORGAN_KEYWORD_COLORS: Array<[string, string]> = [
  ["heart", "#c0392b"],
  ["lung", "#e8a0a8"],
  ["bronch", "#e0b0b0"],
  ["trachea", "#d9b8b0"],
  ["oesophag", "#d4a090"],
  ["esophag", "#d4a090"],
  ["larynx", "#cfa090"],
  ["diaphragm", "#b87878"],
  ["liver", "#8b5a2b"],
  ["spleen", "#7a3e5c"],
  ["kidney", "#c06050"],
  ["adrenal", "#c4a060"],
  ["pancrea", "#d4c4a0"],
  ["bladder", "#c8b878"],
  ["ureter", "#c0a888"],
  ["uterus", "#d08090"],
  ["ovar", "#d08090"],
  ["stom", "#d09070"],
  ["duoden", "#d49888"],
  ["jejun", "#d09088"],
  ["ileum", "#c88880"],
  ["colon", "#c87870"],
  ["caecum", "#c07068"],
  ["lymph", "#a090b8"],
];

export type DidacticTintKey = {
  region?: string | null;
  node?: string | null;
  label?: string | null;
};

/** Stable pastel when region id is not in the table. */
export function hashRegionColor(regionId: string): string {
  let h = 0;
  for (let i = 0; i < regionId.length; i++) {
    h = (h * 31 + regionId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const sat = 42 + (h % 18);
  const light = 58 + (h % 12);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function organOverride(node: string, label: string): string | null {
  const hay = `${node} ${label}`.toLowerCase();
  for (const [keyword, hex] of ORGAN_KEYWORD_COLORS) {
    if (hay.includes(keyword)) return hex;
  }
  return null;
}

/**
 * Resolve teaching color for a structure. Null = leave authored material.
 * Organ keywords override the organs (and VT organs) region default.
 */
export function didacticColorFor(key: DidacticTintKey): string | null {
  const region = key.region?.trim() || "";
  const node = key.node ?? "";
  const label = key.label ?? "";
  if (
    region === "organs" ||
    region.endsWith("-organs") ||
    region.includes("organ")
  ) {
    const hit = organOverride(node, label);
    if (hit) return hit;
  }
  if (region && REGION_DIDACTIC_COLORS[region]) {
    return REGION_DIDACTIC_COLORS[region];
  }
  if (region) return hashRegionColor(region);
  // Flat leaf packs: still tint organs by keyword when we can guess.
  return organOverride(node, label);
}
