import type { DatasetEntry } from "./datasets/schema";

export type AtlasMakeCardsSource = {
  entryKey: string;
  text: string;
  citations: string[];
  topicHints: string[];
};

type MakeCardsSourceArgs = {
  entryKey: string;
  canonicalName: string;
  commonName: string | null;
  aliases: string[];
  fields: DatasetEntry["fields"];
  refs: {
    field: string | null;
    citation: string;
    url: string | null;
    note: string | null;
  }[];
};

function citationsFromRefs(refs: MakeCardsSourceArgs["refs"]): string[] {
  return [
    ...new Set(
      refs
        .map((r) => r.citation.trim())
        .filter((c) => c.length > 0),
    ),
  ];
}

function topicHintsFor(args: MakeCardsSourceArgs): string[] {
  // generation normalizeTopicHints caps at 5 entries.
  return [
    args.canonicalName,
    ...args.aliases.slice(0, 1),
    "lifecycle",
    "hosts",
    "diagnosis",
  ].filter((h) => h.trim().length > 0);
}

function appendLifecycleLines(
  lines: string[],
  stages: DatasetEntry["fields"]["lifecycleStages"],
): void {
  if (stages.length === 0) return;
  lines.push("Lifecycle order:");
  for (const [i, stage] of stages.entries()) {
    const bits = [
      stage.name,
      stage.host ? `host ${stage.host}` : null,
      stage.hostRole ? `role ${stage.hostRole}` : null,
      stage.infective ? "infective" : null,
      stage.durationDays
        ? `${stage.durationDays.min}-${stage.durationDays.max} days`
        : null,
      stage.transmission ? `transmission ${stage.transmission}` : null,
    ].filter(Boolean);
    lines.push(`${i + 1}. ${bits.join("; ")}`);
  }
}

function appendDiagnosticTestLines(
  lines: string[],
  tests: DatasetEntry["fields"]["diagnosticTests"],
): void {
  if (tests.length === 0) return;
  lines.push("Diagnostic tests:");
  for (const test of tests) {
    const window =
      test.windowStartWeek != null || test.windowEndWeek != null
        ? ` (weeks ${test.windowStartWeek ?? "?"}-${test.windowEndWeek ?? "?"})`
        : "";
    lines.push(`- ${test.name}${window}`);
  }
}

function appendCitationLines(lines: string[], citations: string[]): void {
  if (citations.length === 0) return;
  lines.push("");
  lines.push("References:");
  for (const citation of citations) {
    lines.push(`- ${citation}`);
  }
}

function fieldFactLines(
  args: MakeCardsSourceArgs,
  omit: ReadonlySet<string>,
): string[] {
  const f = args.fields;
  return [
    !omit.has("commonName") && args.commonName
      ? `Common name: ${args.commonName}`
      : null,
    !omit.has("group") ? `Group: ${f.group}` : null,
    !omit.has("family") && f.family ? `Family: ${f.family}` : null,
    !omit.has("phylum") && f.phylum ? `Phylum: ${f.phylum}` : null,
    !omit.has("order") && f.order ? `Order: ${f.order}` : null,
    !omit.has("definitiveHosts") && f.definitiveHosts.length > 0
      ? `Definitive hosts: ${f.definitiveHosts.join("; ")}`
      : null,
    !omit.has("intermediateHosts") && f.intermediateHosts.length > 0
      ? `Intermediate hosts: ${f.intermediateHosts.join("; ")}`
      : null,
    !omit.has("paratenicHosts") && f.paratenicHosts.length > 0
      ? `Paratenic hosts: ${f.paratenicHosts.join("; ")}`
      : null,
    !omit.has("majorOrgan") && f.majorOrgan
      ? `Major organ: ${f.majorOrgan}`
      : null,
    !omit.has("zoonotic") && f.zoonotic ? `Zoonotic: ${f.zoonotic}` : null,
    !omit.has("distribution") && f.distribution
      ? `Distribution: ${f.distribution}`
      : null,
    !omit.has("significance") && f.significance
      ? `Significance: ${f.significance}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

function appendStructuredLeftovers(
  lines: string[],
  fields: DatasetEntry["fields"],
  omit: ReadonlySet<string>,
): void {
  if (!omit.has("lifecycleStages")) {
    appendLifecycleLines(lines, fields.lifecycleStages);
  }
  if (!omit.has("diagnosticTests")) {
    appendDiagnosticTestLines(lines, fields.diagnosticTests);
  }
  if (!omit.has("diagnosticStage") && fields.diagnosticStage) {
    lines.push(`Diagnostic stage: ${fields.diagnosticStage}`);
  }
}

/** Build paste-text generation source from a dataset/overlay entry view shape. */
export function buildAtlasMakeCardsSource(
  args: MakeCardsSourceArgs,
): AtlasMakeCardsSource {
  const lines: string[] = [
    `Parasite: ${args.canonicalName}`,
    args.commonName ? `Common name: ${args.commonName}` : null,
    args.aliases.length > 0 ? `Aliases: ${args.aliases.join("; ")}` : null,
    ...fieldFactLines(args, new Set(["commonName"])),
  ].filter((line): line is string => Boolean(line));

  appendStructuredLeftovers(lines, args.fields, new Set());

  lines.push("");
  lines.push(
    "Generate study cards covering hosts/family (MCQ), lifecycle order (cloze), and which diagnostic test applies at a given week (Q&A).",
  );

  const citations = citationsFromRefs(args.refs);
  appendCitationLines(lines, citations);

  return {
    entryKey: args.entryKey,
    text: lines.join("\n"),
    citations,
    topicHints: topicHintsFor(args),
  };
}

/** Extras-only paste text: omit precraft-covered fields; empty when nothing left. */
export function buildAtlasMakeCardsExtrasSource(
  args: MakeCardsSourceArgs & { coveredFieldKeys: readonly string[] },
): AtlasMakeCardsSource {
  const omit = new Set(args.coveredFieldKeys);
  const leftover = fieldFactLines(args, omit);
  appendStructuredLeftovers(leftover, args.fields, omit);

  const citations = citationsFromRefs(args.refs);

  if (leftover.length === 0) {
    return {
      entryKey: args.entryKey,
      text: "",
      citations,
      topicHints: topicHintsFor(args),
    };
  }

  const lines: string[] = [
    `Parasite: ${args.canonicalName}`,
    args.aliases.length > 0 ? `Aliases: ${args.aliases.join("; ")}` : null,
    ...leftover,
  ].filter((line): line is string => Boolean(line));

  lines.push("");
  lines.push(
    "Generate study cards for leftover lifecycle order (cloze), diagnostic tests at a given week (Q&A), and clinical significance. Skip already-templated hosts and family.",
  );
  appendCitationLines(lines, citations);

  return {
    entryKey: args.entryKey,
    text: lines.join("\n"),
    citations,
    topicHints: topicHintsFor(args),
  };
}

export type AtlasJobProvenance = {
  atlasEntryId: string;
  citations: string[];
};

export function parseAtlasJobProvenance(
  raw: string | null | undefined,
): AtlasJobProvenance | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { atlasEntryId?: unknown }).atlasEntryId !== "string" ||
      !Array.isArray((parsed as { citations?: unknown }).citations)
    ) {
      return null;
    }
    const atlasEntryId = (parsed as { atlasEntryId: string }).atlasEntryId.trim();
    if (!atlasEntryId) return null;
    const citations = (parsed as { citations: unknown[] })
      .citations.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
    return { atlasEntryId, citations };
  } catch {
    return null;
  }
}
