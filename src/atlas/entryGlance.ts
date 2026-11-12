import { FIELD_LABELS, ZOONOTIC_LABELS } from "./entryFields";
import { pppLabel, termLabel } from "./filter";
import type { DatasetFields } from "./types";

export type GlanceKey =
  | "definitiveHosts"
  | "intermediateHosts"
  | "majorOrgan"
  | "pppDays"
  | "diagnosticStage"
  | "zoonotic"
  | "infective";

export type GlanceRow = {
  key: GlanceKey;
  label: string;
  citeField: keyof DatasetFields | null;
  kind: "terms" | "text";
  terms?: string[];
  text?: string;
};

const MORE_KEYS: (keyof DatasetFields)[] = [
  "paratenicHosts",
  "vectorRole",
  "onHostStages",
  "distribution",
  "significance",
  "phylum",
  "order",
];

export function moreFactKeys(): (keyof DatasetFields)[] {
  return MORE_KEYS;
}

export function entryMetaLine(fields: DatasetFields): string | null {
  const parts = [
    fields.group ? termLabel(fields.group) : null,
    fields.family || null,
    fields.lifecycleType ? `${termLabel(fields.lifecycleType)} lifecycle` : null,
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

export function glanceRows(fields: DatasetFields): GlanceRow[] {
  const rows: GlanceRow[] = [];
  if (fields.definitiveHosts.length)
    rows.push({
      key: "definitiveHosts",
      label: FIELD_LABELS.definitiveHosts,
      citeField: "definitiveHosts",
      kind: "terms",
      terms: fields.definitiveHosts,
    });
  if (fields.intermediateHosts.length)
    rows.push({
      key: "intermediateHosts",
      label: FIELD_LABELS.intermediateHosts,
      citeField: "intermediateHosts",
      kind: "terms",
      terms: fields.intermediateHosts,
    });
  if (fields.majorOrgan)
    rows.push({
      key: "majorOrgan",
      label: FIELD_LABELS.majorOrgan,
      citeField: "majorOrgan",
      kind: "text",
      text: termLabel(fields.majorOrgan),
    });
  const ppp = pppLabel(fields.pppDays);
  if (ppp)
    rows.push({
      key: "pppDays",
      label: FIELD_LABELS.pppDays,
      citeField: "pppDays",
      kind: "text",
      text: ppp,
    });
  if (fields.diagnosticStage)
    rows.push({
      key: "diagnosticStage",
      label: FIELD_LABELS.diagnosticStage,
      citeField: "diagnosticStage",
      kind: "text",
      text: termLabel(fields.diagnosticStage),
    });
  if (fields.zoonotic)
    rows.push({
      key: "zoonotic",
      label: FIELD_LABELS.zoonotic,
      citeField: "zoonotic",
      kind: "text",
      text: ZOONOTIC_LABELS[fields.zoonotic],
    });
  const infective = infectiveStageLabel(fields.lifecycleStages);
  if (infective)
    rows.push({
      key: "infective",
      label: "Infective",
      citeField: "lifecycleStages",
      kind: "text",
      text: infective,
    });
  return rows;
}
