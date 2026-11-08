import { normalizeParasiteName } from "./names";
import {
  emptyParasiteFields,
  PARASITE_FIELD_KEYS,
  type ParasiteFieldKey,
  type ParasiteFields,
} from "./templates/parasite";

export type FieldSource = { materialId: string; page: number; excerpt: string };

export type CandidateEntry = {
  rawName: string;
  commonName: string | null;
  fields: ParasiteFields;
  source: FieldSource;
};

export type EntrySource = FieldSource & { fieldKey: ParasiteFieldKey };

export type FieldConflict = { fieldKey: ParasiteFieldKey; values: unknown[] };

export type MergedEntry = {
  canonicalName: string;
  commonName: string | null;
  nameCorrected: boolean;
  fields: ParasiteFields;
  sources: EntrySource[];
  conflicts: FieldConflict[];
};

const UNION_KEYS = new Set<ParasiteFieldKey>([
  "definitiveHosts",
  "intermediateHosts",
  "paratenicHosts",
  "onHostStages",
]);

function isEmpty(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "string" ? v.trim().toLowerCase() : v,
  );
}

function unionStrings(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((s) => s.toLowerCase()));
  const out = [...current];
  for (const item of incoming) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function recordConflict(
  entry: MergedEntry,
  fieldKey: ParasiteFieldKey,
  kept: unknown,
  incoming: unknown,
): void {
  let conflict = entry.conflicts.find((c) => c.fieldKey === fieldKey);
  if (!conflict) {
    conflict = { fieldKey, values: [kept] };
    entry.conflicts.push(conflict);
  }
  if (!conflict.values.some((v) => comparable(v) === comparable(incoming))) {
    conflict.values.push(incoming);
  }
}

function addSource(entry: MergedEntry, source: EntrySource): void {
  const duplicate = entry.sources.some(
    (s) =>
      s.fieldKey === source.fieldKey &&
      s.materialId === source.materialId &&
      s.page === source.page,
  );
  if (!duplicate) entry.sources.push(source);
}

export function mergeCandidates(candidates: CandidateEntry[]): {
  entries: MergedEntry[];
  unnamed: CandidateEntry[];
} {
  const byName = new Map<string, MergedEntry>();
  const unnamed: CandidateEntry[] = [];

  for (const candidate of candidates) {
    const name = normalizeParasiteName(candidate.rawName);
    if (!name) {
      unnamed.push(candidate);
      continue;
    }

    let entry = byName.get(name.canonical);
    if (!entry) {
      entry = {
        canonicalName: name.canonical,
        commonName: null,
        nameCorrected: false,
        fields: emptyParasiteFields(),
        sources: [],
        conflicts: [],
      };
      byName.set(name.canonical, entry);
    }
    entry.nameCorrected ||= name.corrected;
    entry.commonName ??= candidate.commonName;

    const fields = entry.fields as Record<ParasiteFieldKey, unknown>;
    for (const key of PARASITE_FIELD_KEYS) {
      const incoming = candidate.fields[key];
      if (isEmpty(incoming)) continue;
      addSource(entry, { ...candidate.source, fieldKey: key });

      const current = fields[key];
      if (isEmpty(current)) {
        fields[key] = incoming;
      } else if (UNION_KEYS.has(key)) {
        fields[key] = unionStrings(current as string[], incoming as string[]);
      } else if (comparable(current) !== comparable(incoming)) {
        recordConflict(entry, key, current, incoming);
      }
    }
  }

  const entries = [...byName.values()].sort((a, b) =>
    a.canonicalName.localeCompare(b.canonicalName),
  );
  return { entries, unnamed };
}
