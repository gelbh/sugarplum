import {
  SOURCE_ROLE_LABELS,
  type SourceRole,
} from "../../materials/sourceRole";
import { matchMaterialForPack, packTargets } from "./packMatch";
import type { AtlasTier } from "../types";

const KEY_ROLES: ReadonlySet<SourceRole> = new Set([
  "tutorial",
  "practical",
  "past_paper",
]);

export type FocusMaterial = {
  id: string;
  filename: string | null;
  sourceRole: SourceRole;
  pages: { page: number; text: string }[];
};

export type FocusEntry = {
  canonicalName: string;
  commonName: string | null;
  aliases: string[];
};

export type FocusManualOverride = AtlasTier | null;

export type FocusScanResult = {
  tier: AtlasTier;
  reason: string;
  /** Every material that mentions the entry under lenient pack matching. */
  materialIds: string[];
  inPack: boolean;
};

export function scanFocus(
  entry: FocusEntry,
  materials: FocusMaterial[],
  manualOverride?: FocusManualOverride,
  genera?: ReadonlySet<string>,
): FocusScanResult {
  const targets = packTargets(entry, genera);
  const matches = materials.map((material) => ({
    material,
    ...matchMaterialForPack(targets, material),
  }));
  const materialIds = matches
    .filter((m) => m.lenient)
    .map((m) => m.material.id);
  const inPack = materialIds.length > 0;

  if (manualOverride) {
    return {
      tier: manualOverride,
      reason: manualOverride === "key" ? "Manual pin" : "Manual demote",
      materialIds,
      inPack,
    };
  }

  // Tiers keep the strict matcher so ranking does not change.
  const keyHit = matches.find(
    (m) => m.strict && KEY_ROLES.has(m.material.sourceRole),
  )?.material;
  if (keyHit) {
    const label = SOURCE_ROLE_LABELS[keyHit.sourceRole].toLowerCase();
    const title = keyHit.filename ?? keyHit.id;
    return {
      tier: "key",
      reason: `Named in ${label} "${title}"`,
      materialIds,
      inPack,
    };
  }

  const mentionCount = matches.filter((m) => m.strict).length;
  if (mentionCount >= 3) {
    return {
      tier: "frequent",
      reason: `Mentioned in ${mentionCount} materials`,
      materialIds,
      inPack,
    };
  }

  return { tier: "standard", reason: "Standard", materialIds, inPack };
}
