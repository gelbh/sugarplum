import { SOURCE_ROLE_LABELS, type SourceRole } from "../lib/sourceRole";
import { entryNameForms, textMentionsEntry } from "./nameMatch";
import type { AtlasTier } from "./types";

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
  materialIds: string[];
};

export function scanFocus(
  entry: FocusEntry,
  materials: FocusMaterial[],
  manualOverride?: FocusManualOverride,
): FocusScanResult {
  if (manualOverride) {
    return {
      tier: manualOverride,
      reason: manualOverride === "key" ? "Manual pin" : "Manual demote",
      materialIds: [],
    };
  }

  const forms = entryNameForms(entry);
  const keyHits = materials.filter(
    (m) => KEY_ROLES.has(m.sourceRole) && materialKeysEntry(m, forms),
  );
  if (keyHits.length > 0) {
    const hit = keyHits[0];
    const label = SOURCE_ROLE_LABELS[hit.sourceRole].toLowerCase();
    const title = hit.filename ?? hit.id;
    return {
      tier: "key",
      reason: `Named in ${label} "${title}"`,
      materialIds: keyHits.map((m) => m.id),
    };
  }

  const mentionIds = materials
    .filter((m) => materialMentionsEntry(m, forms))
    .map((m) => m.id);
  if (mentionIds.length >= 3) {
    return {
      tier: "frequent",
      reason: `Mentioned in ${mentionIds.length} materials`,
      materialIds: mentionIds,
    };
  }

  return { tier: "standard", reason: "Standard", materialIds: [] };
}

function materialKeysEntry(
  material: FocusMaterial,
  forms: readonly string[],
): boolean {
  if (material.filename && textMentionsEntry(material.filename, forms)) {
    return true;
  }
  return material.pages.some((p) => textMentionsEntry(p.text, forms));
}

function materialMentionsEntry(
  material: FocusMaterial,
  forms: readonly string[],
): boolean {
  if (material.filename && textMentionsEntry(material.filename, forms)) {
    return true;
  }
  return material.pages.some((p) => textMentionsEntry(p.text, forms));
}
