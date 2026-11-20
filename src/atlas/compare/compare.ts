import type { AtlasEntryView, DatasetFields } from "../types";

export type CompareValue =
  | { kind: "text"; value: string | null }
  | { kind: "list"; values: string[]; taxa: boolean }
  | { kind: "range"; value: { min: number; max: number } | null };

export type CompareRow = {
  key: CompareRowKey;
  label: string;
  a: CompareValue;
  b: CompareValue;
  differs: boolean;
};

const text = (value: string | null): CompareValue => ({ kind: "text", value });
const list = (values: string[], taxa = true): CompareValue => ({
  kind: "list",
  values: [...new Set(values)],
  taxa,
});

type RowDef = {
  key: string;
  label: string;
  get: (f: DatasetFields) => CompareValue;
};

const ROWS = [
  { key: "group", label: "Group", get: (f) => text(f.group) },
  { key: "family", label: "Family", get: (f) => text(f.family) },
  {
    key: "definitiveHosts",
    label: "Definitive hosts",
    get: (f) => list(f.definitiveHosts),
  },
  {
    key: "intermediateHosts",
    label: "Intermediate hosts",
    get: (f) => list(f.intermediateHosts),
  },
  { key: "site", label: "Site", get: (f) => text(f.majorOrgan) },
  { key: "zoonotic", label: "Zoonotic", get: (f) => text(f.zoonotic) },
  {
    key: "ppp",
    label: "PPP",
    get: (f) => ({ kind: "range", value: f.pppDays }),
  },
  {
    key: "lifecycleType",
    label: "Lifecycle",
    get: (f) => text(f.lifecycleType),
  },
  {
    key: "diagnosticStage",
    label: "Diagnostic stage",
    get: (f) => text(f.diagnosticStage),
  },
  {
    key: "tests",
    label: "Tests",
    get: (f) =>
      list(
        f.diagnosticTests.map((t) => t.name),
        false,
      ),
  },
] as const satisfies readonly RowDef[];

export type CompareRowKey = (typeof ROWS)[number]["key"];

function sameValue(a: CompareValue, b: CompareValue): boolean {
  if (a.kind === "list" && b.kind === "list") {
    const set = new Set(a.values);
    return (
      a.values.length === b.values.length && b.values.every((v) => set.has(v))
    );
  }
  if (a.kind === "range" && b.kind === "range") {
    if (a.value === null || b.value === null) return a.value === b.value;
    return a.value.min === b.value.min && a.value.max === b.value.max;
  }
  if (a.kind === "text" && b.kind === "text") return a.value === b.value;
  return false;
}

export function compareRows(
  a: AtlasEntryView,
  b: AtlasEntryView,
): CompareRow[] {
  return ROWS.map(({ key, label, get }) => {
    const va = get(a.fields);
    const vb = get(b.fields);
    return { key, label, a: va, b: vb, differs: !sameValue(va, vb) };
  });
}
