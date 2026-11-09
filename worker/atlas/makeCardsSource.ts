import type { DatasetEntry } from "./datasets/schema";

export type AtlasMakeCardsSource = {
  entryKey: string;
  text: string;
  citations: string[];
  topicHints: string[];
};

/** Build paste-text generation source from a dataset/overlay entry view shape. */
export function buildAtlasMakeCardsSource(args: {
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
}): AtlasMakeCardsSource {
  const f = args.fields;
  const lines: string[] = [
    `Parasite: ${args.canonicalName}`,
    args.commonName ? `Common name: ${args.commonName}` : null,
    args.aliases.length > 0 ? `Aliases: ${args.aliases.join("; ")}` : null,
    `Group: ${f.group}`,
    f.family ? `Family: ${f.family}` : null,
    f.phylum ? `Phylum: ${f.phylum}` : null,
    f.order ? `Order: ${f.order}` : null,
    f.definitiveHosts.length > 0
      ? `Definitive hosts: ${f.definitiveHosts.join("; ")}`
      : null,
    f.intermediateHosts.length > 0
      ? `Intermediate hosts: ${f.intermediateHosts.join("; ")}`
      : null,
    f.paratenicHosts.length > 0
      ? `Paratenic hosts: ${f.paratenicHosts.join("; ")}`
      : null,
    f.majorOrgan ? `Major organ: ${f.majorOrgan}` : null,
    f.zoonotic ? `Zoonotic: ${f.zoonotic}` : null,
    f.distribution ? `Distribution: ${f.distribution}` : null,
    f.significance ? `Significance: ${f.significance}` : null,
  ].filter((line): line is string => Boolean(line));

  if (f.lifecycleStages.length > 0) {
    lines.push("Lifecycle order:");
    for (const [i, stage] of f.lifecycleStages.entries()) {
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

  if (f.diagnosticTests.length > 0) {
    lines.push("Diagnostic tests:");
    for (const test of f.diagnosticTests) {
      const window =
        test.windowStartWeek != null || test.windowEndWeek != null
          ? ` (weeks ${test.windowStartWeek ?? "?"}-${test.windowEndWeek ?? "?"})`
          : "";
      lines.push(`- ${test.name}${window}`);
    }
  }

  if (f.diagnosticStage) {
    lines.push(`Diagnostic stage: ${f.diagnosticStage}`);
  }

  lines.push("");
  lines.push(
    "Generate study cards covering hosts/family (MCQ), lifecycle order (cloze), and which diagnostic test applies at a given week (Q&A).",
  );

  const citations = [
    ...new Set(
      args.refs
        .map((r) => r.citation.trim())
        .filter((c) => c.length > 0),
    ),
  ];
  if (citations.length > 0) {
    lines.push("");
    lines.push("References:");
    for (const citation of citations) {
      lines.push(`- ${citation}`);
    }
  }

  // generation normalizeTopicHints caps at 5 entries.
  const topicHints = [
    args.canonicalName,
    ...args.aliases.slice(0, 1),
    "lifecycle",
    "hosts",
    "diagnosis",
  ].filter((h) => h.trim().length > 0);

  return {
    entryKey: args.entryKey,
    text: lines.join("\n"),
    citations,
    topicHints,
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
