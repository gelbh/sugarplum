import { SOURCE_ROLE_LABELS, type SourceRole } from "../../materials/sourceRole";
import { entryNameForms, textMentionsEntry } from "./nameMatch";
import { materialMentionsForPack } from "./packMatch";
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
  /** materialIds.length > 0 */
  inPack: boolean;
};

export function scanFocus(
  entry: FocusEntry,
  materials: FocusMaterial[],
  manualOverride?: FocusManualOverride,
): FocusScanResult {
  const materialIds = materials
    .filter((m) => materialMentionsForPack(entry, m))
    .map((m) => m.id);
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
  const forms = entryNameForms(entry);
  const keyHit = materials.find(
    (m) => KEY_ROLES.has(m.sourceRole) && materialNamesEntry(m, forms),
  );
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

  const mentionCount = materials.filter((m) =>
    materialNamesEntry(m, forms),
  ).length;
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

function materialNamesEntry(
  material: FocusMaterial,
  forms: readonly string[],
): boolean {
  if (material.filename && textMentionsEntry(material.filename, forms)) {
    return true;
  }
  return material.pages.some((p) => textMentionsEntry(p.text, forms));
}
