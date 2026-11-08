import type { AtlasEntryView, DatasetFields } from "./types";

type FieldKey = keyof DatasetFields;

export const FIELD_LABELS: Record<FieldKey, string> = {
  phylum: "Phylum",
  order: "Order",
  family: "Family",
  group: "Group",
  definitiveHosts: "Definitive hosts",
  intermediateHosts: "Intermediate hosts",
  paratenicHosts: "Paratenic hosts",
  vectorRole: "Vector role",
  majorOrgan: "Site",
  onHostStages: "Stages on the host",
  distribution: "Distribution",
  zoonotic: "Zoonotic",
  significance: "Significance",
  lifecycleType: "Lifecycle type",
  pppDays: "Prepatent period",
  lifecycleStages: "Lifecycle stages",
  diagnosticStage: "Diagnostic stage",
  diagnosticTests: "Diagnostic tests",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as FieldKey[];

export const isFieldKey = (key: string): key is FieldKey => key in FIELD_LABELS;

type Ref = AtlasEntryView["refs"][number];

export type RefGroup = {
  field: FieldKey | null;
  label: string;
  refs: { n: number; ref: Ref }[];
};

export type EntryRefs = {
  groups: RefGroup[];
  /** Source numbers cited for each field, for the superscripts in the facts column. */
  byField: Map<FieldKey, number[]>;
};

/** One number per distinct source, so a citation reused across fields keeps its number. */
export function entryRefs(refs: Ref[]): EntryRefs {
  const numbers = new Map<string, number>();
  const numberOf = (r: Ref) => {
    const id = `${r.citation}\n${r.url ?? ""}`;
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
    return numbers.get(id)!;
  };
  const whole: RefGroup = { field: null, label: "Whole entry", refs: [] };
  const byGroup = new Map<FieldKey, RefGroup>();
  const byField = new Map<FieldKey, number[]>();
  for (const ref of refs) {
    const n = numberOf(ref);
    const field =
      ref.field !== null && isFieldKey(ref.field) ? ref.field : null;
    if (field === null) {
      whole.refs.push({ n, ref });
      continue;
    }
    if (!byGroup.has(field))
      byGroup.set(field, { field, label: FIELD_LABELS[field], refs: [] });
    byGroup.get(field)!.refs.push({ n, ref });
    const cited = byField.get(field) ?? [];
    if (!cited.includes(n))
      byField.set(
        field,
        [...cited, n].sort((a, b) => a - b),
      );
  }
  const fieldGroups = FIELD_ORDER.flatMap((f) => byGroup.get(f) ?? []);
  return {
    groups: whole.refs.length > 0 ? [whole, ...fieldGroups] : fieldGroups,
    byField,
  };
}

export const refAnchor = (field: FieldKey | null) =>
  `atlas-ref-${field ?? "entry"}`;

export const ZOONOTIC_LABELS = {
  yes: "Yes",
  no: "No",
  potential: "Potentially",
} as const;

export function windowLabel(start: number | null, end: number | null) {
  if (start === null) return end === null ? null : `Up to week ${end}`;
  if (end === null) return `From week ${start}`;
  return start === end ? `Week ${start}` : `Weeks ${start} to ${end}`;
}
