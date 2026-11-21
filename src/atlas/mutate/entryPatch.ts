import { diagnosticOwnershipIssue } from "../../../worker/atlas/lifecycleDiagnostic";
import {
  parasiteFieldsPatchSchema,
  type ParasiteFields,
} from "../../../worker/atlas/templates/parasite";
import {
  ALIAS_MAX_CHARS,
  ALIAS_MAX_ITEMS,
  cleanAliasList,
} from "../hub/nameMatch";
import type { AtlasEntryView, DatasetFields, FieldKey } from "../types";

/** Sparse PATCH /entries/:entryId body: only keys the learner changed. */
export type EntryPatch = {
  commonName?: string;
  /** Learner-added entries only; the server rejects it for dataset origins. */
  canonicalName?: string;
  /** Full learner alias list; it replaces aliases_json. Dataset aliases are never sent. */
  aliases?: string[];
  fields?: Partial<DatasetFields>;
};

/** Wire body: an edit, a per-field reset, or both. Resets never reach afterSave. */
export type EntryPatchBody = EntryPatch & { resetFields?: FieldKey[] };

export const EDIT_SECTIONS = [
  "names",
  "taxonomy",
  "hosts",
  "biology",
  "distribution",
  "clinical",
  "diagnosis",
] as const;
export type EditSectionId = (typeof EDIT_SECTIONS)[number];

export const EDIT_SECTION_TITLES: Record<EditSectionId, string> = {
  names: "Names",
  taxonomy: "Taxonomy",
  hosts: "Hosts",
  biology: "Biology",
  distribution: "Distribution",
  clinical: "Clinical",
  diagnosis: "Diagnosis",
};

export const editSectionDomId = (id: EditSectionId) => `atlas-edit-${id}`;

export type DiagnosticTestDraft = {
  name: string;
  sample: string;
  /** Not editable here; carried so a save does not erase them. */
  windowStartWeek: number | null;
  windowEndWeek: number | null;
};

/** Dialog form state: free text where the learner types, typed values for pickers. */
export type EntryDraft = {
  commonName: string;
  canonicalName: string;
  /** One alias per line. */
  aliases: string;
  phylum: string;
  order: string;
  family: string;
  group: DatasetFields["group"];
  definitiveHosts: string;
  intermediateHosts: string;
  paratenicHosts: string;
  majorOrgan: string;
  onHostStages: string;
  lifecycleType: NonNullable<DatasetFields["lifecycleType"]> | "";
  pppMin: string;
  pppMax: string;
  distribution: string;
  distributionWorldwide: boolean;
  distributionRegions: DatasetFields["distributionRegions"];
  climateBands: DatasetFields["climateBands"];
  zoonotic: NonNullable<DatasetFields["zoonotic"]> | "";
  significance: string;
  vectorRole: string;
  diagnosticStage: string;
  diagnosticTests: DiagnosticTestDraft[];
};

export type TextDraftKey =
  | "commonName"
  | "canonicalName"
  | "aliases"
  | "phylum"
  | "order"
  | "family"
  | "definitiveHosts"
  | "intermediateHosts"
  | "paratenicHosts"
  | "majorOrgan"
  | "onHostStages"
  | "pppMin"
  | "pppMax"
  | "distribution"
  | "significance"
  | "vectorRole"
  | "diagnosticStage";

export type EntryPatchErrorKey =
  | "commonName"
  | "canonicalName"
  | "aliases"
  | FieldKey;
export type EntryPatchErrors = Partial<Record<EntryPatchErrorKey, string>>;

export const PPP_ERROR =
  "Enter whole-number min and max days, with max at least min";
export const DIAGNOSTIC_OWNED_ERROR =
  "The lifecycle editor sets the diagnostic stage";
export const DIAGNOSTIC_TEST_NAME_ERROR = "Name each test or remove the row";

const joinList = (items: readonly string[]) => items.join(", ");
const splitList = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const textOrNull = (raw: string) => raw.trim() || null;
const day = (raw: string) => (raw.trim() === "" ? Number.NaN : Number(raw));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const aliasLines = (raw: string) => cleanAliasList(raw.split("\n"));

export function draftFromEntry(entry: AtlasEntryView): EntryDraft {
  const f = entry.fields;
  return {
    commonName: entry.commonName ?? "",
    canonicalName: entry.canonicalName,
    aliases: entry.learnerAliases.join("\n"),
    phylum: f.phylum ?? "",
    order: f.order ?? "",
    family: f.family ?? "",
    group: f.group,
    definitiveHosts: joinList(f.definitiveHosts),
    intermediateHosts: joinList(f.intermediateHosts),
    paratenicHosts: joinList(f.paratenicHosts),
    majorOrgan: f.majorOrgan ?? "",
    onHostStages: joinList(f.onHostStages),
    lifecycleType: f.lifecycleType ?? "",
    pppMin: f.pppDays ? String(f.pppDays.min) : "",
    pppMax: f.pppDays ? String(f.pppDays.max) : "",
    distribution: f.distribution ?? "",
    distributionWorldwide: f.distributionWorldwide,
    distributionRegions: [...f.distributionRegions],
    climateBands: [...f.climateBands],
    zoonotic: f.zoonotic ?? "",
    significance: f.significance ?? "",
    vectorRole: f.vectorRole ?? "",
    diagnosticStage: f.diagnosticStage ?? "",
    diagnosticTests: f.diagnosticTests.map((t) => ({
      name: t.name,
      sample: t.sample ?? "",
      windowStartWeek: t.windowStartWeek,
      windowEndWeek: t.windowEndWeek,
    })),
  };
}

/** Every dialog-editable field as the PATCH value it would send. */
function fieldsFromDraft(d: EntryDraft): Partial<ParasiteFields> {
  const pppEmpty = d.pppMin.trim() === "" && d.pppMax.trim() === "";
  return {
    phylum: textOrNull(d.phylum),
    order: textOrNull(d.order),
    family: textOrNull(d.family),
    group: d.group,
    definitiveHosts: splitList(d.definitiveHosts),
    intermediateHosts: splitList(d.intermediateHosts),
    paratenicHosts: splitList(d.paratenicHosts),
    majorOrgan: textOrNull(d.majorOrgan),
    onHostStages: splitList(d.onHostStages),
    lifecycleType: d.lifecycleType || null,
    pppDays: pppEmpty ? null : { min: day(d.pppMin), max: day(d.pppMax) },
    distribution: textOrNull(d.distribution),
    distributionWorldwide: d.distributionWorldwide,
    distributionRegions: d.distributionRegions,
    climateBands: d.climateBands,
    zoonotic: d.zoonotic || null,
    significance: textOrNull(d.significance),
    vectorRole: textOrNull(d.vectorRole),
    diagnosticStage: textOrNull(d.diagnosticStage),
    // Entirely empty rows drop out; a row with any data but no name stays so validation can flag it.
    diagnosticTests: d.diagnosticTests
      .filter(
        (t) =>
          t.name.trim() ||
          t.sample.trim() ||
          t.windowStartWeek !== null ||
          t.windowEndWeek !== null,
      )
      .map((t) => ({
        name: t.name.trim(),
        sample: textOrNull(t.sample),
        windowStartWeek: t.windowStartWeek,
        windowEndWeek: t.windowEndWeek,
      })),
  };
}

/**
 * Sparse patch: compares the draft against the entry's own projection, so
 * formatting (list spacing, key order) never counts as a change.
 */
export function diffEntryPatch(
  before: AtlasEntryView,
  draft: EntryDraft,
): EntryPatch {
  const baseline = draftFromEntry(before);
  const patch: EntryPatch = {};

  const common = draft.commonName.trim();
  if (common !== baseline.commonName.trim()) patch.commonName = common;

  if (before.originKey === null) {
    const canonical = draft.canonicalName.trim();
    if (canonical !== before.canonicalName) patch.canonicalName = canonical;
  }

  const aliases = aliasLines(draft.aliases);
  if (!same(aliases, aliasLines(baseline.aliases))) patch.aliases = aliases;

  const next = fieldsFromDraft(draft);
  const prev = fieldsFromDraft(baseline);
  const fields: Partial<ParasiteFields> = {};
  for (const key of Object.keys(next) as (keyof ParasiteFields)[]) {
    if (!same(next[key], prev[key])) Object.assign(fields, { [key]: next[key] });
  }
  if (Object.keys(fields).length > 0) {
    // Learner overlays accept free-text hosts and organs; DatasetFields narrows them to vocab.
    patch.fields = fields as Partial<DatasetFields>;
  }
  return patch;
}

export function isEmptyPatch(patch: EntryPatch): boolean {
  return Object.keys(patch).length === 0;
}

const FIELD_DRAFT_KEYS: Partial<Record<FieldKey, (keyof EntryDraft)[]>> = {
  pppDays: ["pppMin", "pppMax"],
};
const PPP_DRAFT_KEYS: (keyof EntryDraft)[] = ["pppMin", "pppMax"];

/**
 * After a per-field reset: the reset field's inputs come from the fresh view,
 * and so does every other input the student has not touched since `before`.
 * The PPP inputs move together so a reset never leaves a half range.
 */
export function withFieldFromEntry(
  draft: EntryDraft,
  before: AtlasEntryView,
  after: AtlasEntryView,
  field: FieldKey,
): EntryDraft {
  const old = draftFromEntry(before);
  const fresh = draftFromEntry(after);
  const resetKeys =
    FIELD_DRAFT_KEYS[field] ??
    (field in fresh ? [field as keyof EntryDraft] : []);
  const untouched = (keys: (keyof EntryDraft)[]) =>
    keys.every((k) => same(draft[k], old[k]));
  const next = { ...draft };
  const take = (keys: (keyof EntryDraft)[]) => {
    for (const key of keys) Object.assign(next, { [key]: fresh[key] });
  };
  take(resetKeys);
  if (untouched(PPP_DRAFT_KEYS)) take(PPP_DRAFT_KEYS);
  for (const key of Object.keys(fresh) as (keyof EntryDraft)[]) {
    if (!PPP_DRAFT_KEYS.includes(key) && untouched([key])) take([key]);
  }
  return next;
}

/** Inline errors keyed by field; an empty object means the patch can be sent. */
export function validateEntryPatch(
  before: AtlasEntryView,
  patch: EntryPatch,
): EntryPatchErrors {
  const errors: EntryPatchErrors = {};
  if (patch.commonName !== undefined && !patch.commonName) {
    errors.commonName = "Common name required";
  }
  if (patch.canonicalName !== undefined && !patch.canonicalName) {
    errors.canonicalName = "Scientific name required";
  }
  if (patch.aliases) {
    if (patch.aliases.length > ALIAS_MAX_ITEMS) {
      errors.aliases = `At most ${ALIAS_MAX_ITEMS} aliases`;
    } else if (patch.aliases.some((a) => a.length > ALIAS_MAX_CHARS)) {
      errors.aliases = `Each alias must be ${ALIAS_MAX_CHARS} characters or fewer`;
    }
  }
  if (patch.fields) {
    if (patch.fields.diagnosticTests?.some((t) => !t.name)) {
      errors.diagnosticTests = DIAGNOSTIC_TEST_NAME_ERROR;
    }
    const parsed = parasiteFieldsPatchSchema.safeParse(patch.fields);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as FieldKey;
        errors[key] ??= key === "pppDays" ? PPP_ERROR : issue.message;
      }
    }
    if (
      patch.fields.diagnosticStage !== undefined &&
      diagnosticOwnershipIssue(
        before.fields.lifecycleStages,
        patch.fields.diagnosticStage,
      )
    ) {
      errors.diagnosticStage ??= DIAGNOSTIC_OWNED_ERROR;
    }
  }
  return errors;
}
