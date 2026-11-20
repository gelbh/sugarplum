import { FIELD_LABELS } from "./entryFields";
import { pppLabel, termLabel } from "../hub/filter";
import type { DatasetFields } from "../types";

export type GlanceKey =
  | "taxonomy"
  | "definitiveHosts"
  | "intermediateHosts"
  | "paratenicHosts"
  | "vectorRole"
  | "majorOrgan"
  | "onHostStages"
  | "pppDays"
  | "diagnosticStage"
  | "zoonotic"
  | "infective"
  | "distribution"
  | "significance";

export type GlanceSectionId =
  "taxonomy" | "hosts" | "body" | "detection" | "range" | "notes";

export type GlanceRow = {
  key: GlanceKey;
  label: string;
  citeField: keyof DatasetFields | null;
  kind: "terms" | "text";
  terms?: string[];
  text?: string;
  /** Raw cue for value-specific icons (organ key, stage name, group, etc.). */
  iconCue?: string | null;
  distributionWorldwide?: boolean;
  distributionRegions?: DatasetFields["distributionRegions"];
  climateBands?: DatasetFields["climateBands"];
  pppMin?: number;
  pppMax?: number;
};

export type GlanceSection = {
  id: GlanceSectionId;
  title: string;
  rows: GlanceRow[];
};

export function entryMetaLine(fields: DatasetFields): string | null {
  const parts = [
    fields.group ? termLabel(fields.group) : null,
    fields.family || null,
    fields.lifecycleType
      ? `${termLabel(fields.lifecycleType)} lifecycle`
      : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

export function entryLead(
  significance: string | null | undefined,
  maxChars = 220,
): { preview: string; truncated: boolean } | null {
  const raw = significance?.trim();
  if (!raw) return null;
  if (raw.length <= maxChars) return { preview: raw, truncated: false };
  const budget = Math.max(1, maxChars - 1);
  const cut = raw.slice(0, budget);
  const at = cut.lastIndexOf(" ");
  const preview = `${(at > 40 ? cut.slice(0, at) : cut).trimEnd()}…`;
  return { preview, truncated: true };
}

export function infectiveStageLabel(
  stages: DatasetFields["lifecycleStages"],
): string | null {
  const names = stages.filter((s) => s.infective).map((s) => termLabel(s.name));
  return names.length ? names.join(", ") : null;
}

export function infectiveStageCue(
  stages: DatasetFields["lifecycleStages"],
): string | null {
  const names = stages.filter((s) => s.infective).map((s) => s.name);
  return names[0] ?? null;
}

/** Flat list (tests / callers that do not need bands). */
export function glanceRows(fields: DatasetFields): GlanceRow[] {
  return glanceSections(fields).flatMap((s) => s.rows);
}

export type TaxonomyNode = {
  field: "phylum" | "order" | "family";
  label: string;
  value: string;
};

/** Ranked taxonomy for the glance family-tree card (omit empties). */
export function taxonomyTree(fields: DatasetFields): TaxonomyNode[] {
  const nodes: TaxonomyNode[] = [];
  if (fields.phylum)
    nodes.push({
      field: "phylum",
      label: FIELD_LABELS.phylum,
      value: fields.phylum,
    });
  if (fields.order)
    nodes.push({
      field: "order",
      label: FIELD_LABELS.order,
      value: fields.order,
    });
  if (fields.family)
    nodes.push({
      field: "family",
      label: FIELD_LABELS.family,
      value: fields.family,
    });
  return nodes;
}

export function glanceSections(fields: DatasetFields): GlanceSection[] {
  const taxonomy: GlanceRow[] = [];
  const tree = taxonomyTree(fields);
  if (tree.length) {
    taxonomy.push({
      key: "taxonomy",
      label: tree.map((n) => n.label).join(" · "),
      citeField: tree[0]!.field,
      kind: "text",
      text: tree.map((n) => n.value).join(" · "),
      iconCue: fields.group,
    });
  }

  const hosts: GlanceRow[] = [];
  if (fields.definitiveHosts.length)
    hosts.push({
      key: "definitiveHosts",
      label: FIELD_LABELS.definitiveHosts,
      citeField: "definitiveHosts",
      kind: "terms",
      terms: fields.definitiveHosts,
      iconCue: fields.definitiveHosts.join("|"),
    });
  if (fields.intermediateHosts.length)
    hosts.push({
      key: "intermediateHosts",
      label: FIELD_LABELS.intermediateHosts,
      citeField: "intermediateHosts",
      kind: "terms",
      terms: fields.intermediateHosts,
      iconCue: fields.intermediateHosts.join("|"),
    });
  if (fields.paratenicHosts.length)
    hosts.push({
      key: "paratenicHosts",
      label: FIELD_LABELS.paratenicHosts,
      citeField: "paratenicHosts",
      kind: "terms",
      terms: fields.paratenicHosts,
      iconCue: fields.paratenicHosts.join("|"),
    });

  const body: GlanceRow[] = [];
  if (fields.majorOrgan)
    body.push({
      key: "majorOrgan",
      label: FIELD_LABELS.majorOrgan,
      citeField: "majorOrgan",
      kind: "terms",
      terms: [fields.majorOrgan],
      iconCue: fields.majorOrgan,
    });
  if (fields.onHostStages.length)
    body.push({
      key: "onHostStages",
      label: FIELD_LABELS.onHostStages,
      citeField: "onHostStages",
      kind: "terms",
      terms: fields.onHostStages,
      iconCue: fields.onHostStages.join("|"),
    });
  const ppp = pppLabel(fields.pppDays);
  if (ppp && fields.pppDays)
    body.push({
      key: "pppDays",
      label: FIELD_LABELS.pppDays,
      citeField: "pppDays",
      kind: "text",
      text: ppp,
      iconCue: "ppp",
      pppMin: fields.pppDays.min,
      pppMax: fields.pppDays.max,
    });

  const detection: GlanceRow[] = [];
  if (fields.diagnosticStage)
    detection.push({
      key: "diagnosticStage",
      label: FIELD_LABELS.diagnosticStage,
      citeField: "diagnosticStage",
      kind: "terms",
      terms: [fields.diagnosticStage],
      iconCue: fields.diagnosticStage,
    });
  const infectiveNames = fields.lifecycleStages
    .filter((s) => s.infective)
    .map((s) => s.name);
  if (infectiveNames.length)
    detection.push({
      key: "infective",
      label: "Infective",
      citeField: "lifecycleStages",
      kind: "terms",
      terms: infectiveNames,
      iconCue: infectiveStageCue(fields.lifecycleStages),
    });
  if (fields.zoonotic) {
    // Only upgrade the portrait when prose explicitly says foodborne (not "raw meat" negation).
    const foodborne =
      fields.zoonotic !== "no" &&
      /\bfoodborne\b/i.test(
        `${fields.significance ?? ""} ${fields.distribution ?? ""}`,
      );
    detection.push({
      key: "zoonotic",
      label: FIELD_LABELS.zoonotic,
      citeField: "zoonotic",
      kind: "terms",
      terms: [foodborne ? "foodborne" : fields.zoonotic],
      iconCue: foodborne
        ? `zoonotic:${fields.zoonotic}:food`
        : `zoonotic:${fields.zoonotic}`,
    });
  }
  if (fields.vectorRole)
    detection.push({
      key: "vectorRole",
      label: FIELD_LABELS.vectorRole,
      citeField: "vectorRole",
      kind: "text",
      text: fields.vectorRole,
      iconCue: fields.vectorRole,
    });

  const range: GlanceRow[] = [];
  if (fields.distribution)
    range.push({
      key: "distribution",
      label: FIELD_LABELS.distribution,
      citeField: "distribution",
      kind: "text",
      text: fields.distribution,
      iconCue: fields.distribution,
      distributionWorldwide: fields.distributionWorldwide,
      distributionRegions: fields.distributionRegions,
      climateBands: fields.climateBands,
    });

  const sections: GlanceSection[] = [];
  if (taxonomy.length)
    sections.push({ id: "taxonomy", title: "Taxonomy", rows: taxonomy });
  if (hosts.length) sections.push({ id: "hosts", title: "Hosts", rows: hosts });
  if (body.length)
    sections.push({ id: "body", title: "Body & course", rows: body });
  if (detection.length)
    sections.push({
      id: "detection",
      title: "Detection & risk",
      rows: detection,
    });
  if (range.length) sections.push({ id: "range", title: "Range", rows: range });
  return sections;
}

const MOBILE_PRIMARY_IDS = new Set<GlanceSectionId>([
  "hosts",
  "body",
  "detection",
]);

/** Split densify bands for phone: study-critical first, rest behind disclosure. */
export function splitGlanceForMobile(sections: GlanceSection[]): {
  primary: GlanceSection[];
  more: GlanceSection[];
} {
  const primary: GlanceSection[] = [];
  const more: GlanceSection[] = [];
  for (const s of sections) {
    (MOBILE_PRIMARY_IDS.has(s.id) ? primary : more).push(s);
  }
  return { primary, more };
}

/** Full significance row when the lead preview is truncated. */
export function significanceFullRow(
  fields: DatasetFields,
  truncated: boolean,
): GlanceRow | null {
  if (!truncated || !fields.significance?.trim()) return null;
  return {
    key: "significance",
    label: FIELD_LABELS.significance,
    citeField: "significance",
    kind: "text",
    text: fields.significance,
    iconCue: "significance",
  };
}
