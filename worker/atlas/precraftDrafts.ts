import type { DatasetEntry } from "./datasets/schema";
import type { StudyClaim } from "../generation/claims";
import type { CardDraft } from "../generation/schema";

export type AtlasPrecraftResult = {
  claims: StudyClaim[];
  drafts: CardDraft[];
  coveredFieldKeys: string[];
};

type PrecraftArgs = {
  entryKey: string;
  canonicalName: string;
  commonName: string | null;
  aliases: string[];
  fields: DatasetEntry["fields"];
};

type FieldEmit = {
  key: string;
  excerpt: string;
  front: string;
  back: string;
  predicate: string;
  object: string;
};

function joinList(values: string[]): string {
  return values.join("; ");
}

function formatPpp(ppp: { min: number; max: number }): string {
  return ppp.min === ppp.max
    ? `about ${ppp.min} days`
    : `${ppp.min}-${ppp.max} days`;
}

function emitQa(args: {
  key: string;
  question: string;
  back: string;
  excerpt: string;
  predicate: string;
}): FieldEmit {
  return {
    key: args.key,
    excerpt: args.excerpt,
    front: args.question,
    back: args.back,
    predicate: args.predicate,
    object: args.back,
  };
}

/** Build species-anchored QA drafts + matching claims from typed atlas fields. */
export function buildAtlasPrecraftDrafts(
  args: PrecraftArgs,
): AtlasPrecraftResult {
  const species = args.canonicalName.trim();
  const f = args.fields;
  const emits: FieldEmit[] = [];

  if (args.commonName?.trim()) {
    const back = args.commonName.trim();
    emits.push(
      emitQa({
        key: "commonName",
        question: `What is the common name of ${species}?`,
        back,
        excerpt: `Common name: ${back}`,
        predicate: "has common name",
      }),
    );
  }

  if (f.family?.trim()) {
    const back = f.family.trim();
    emits.push(
      emitQa({
        key: "family",
        question: `What is the family of ${species}?`,
        back,
        excerpt: `Family: ${back}`,
        predicate: "belongs to family",
      }),
    );
  }

  if (f.group?.trim()) {
    const back = f.group.trim();
    emits.push(
      emitQa({
        key: "group",
        question: `What is the group of ${species}?`,
        back,
        excerpt: `Group: ${back}`,
        predicate: "belongs to group",
      }),
    );
  }

  if (f.definitiveHosts.length > 0) {
    const back = joinList(f.definitiveHosts);
    emits.push(
      emitQa({
        key: "definitiveHosts",
        question: `What are the definitive hosts of ${species}?`,
        back,
        excerpt: `Definitive hosts: ${back}`,
        predicate: "has definitive hosts",
      }),
    );
  }

  if (f.intermediateHosts.length > 0) {
    const back = joinList(f.intermediateHosts);
    emits.push(
      emitQa({
        key: "intermediateHosts",
        question: `What are the intermediate hosts of ${species}?`,
        back,
        excerpt: `Intermediate hosts: ${back}`,
        predicate: "has intermediate hosts",
      }),
    );
  }

  if (f.paratenicHosts.length > 0) {
    const back = joinList(f.paratenicHosts);
    emits.push(
      emitQa({
        key: "paratenicHosts",
        question: `What are the paratenic hosts of ${species}?`,
        back,
        excerpt: `Paratenic hosts: ${back}`,
        predicate: "has paratenic hosts",
      }),
    );
  }

  if (f.majorOrgan?.trim()) {
    const back = f.majorOrgan.trim();
    emits.push(
      emitQa({
        key: "majorOrgan",
        question: `What is the major organ of ${species}?`,
        back,
        excerpt: `Major organ: ${back}`,
        predicate: "has major organ",
      }),
    );
  }

  if (f.zoonotic) {
    const back = f.zoonotic;
    emits.push(
      emitQa({
        key: "zoonotic",
        question: `Is ${species} zoonotic?`,
        back,
        excerpt: `Zoonotic: ${back}`,
        predicate: "is zoonotic",
      }),
    );
  }

  if (f.distribution?.trim()) {
    const back = f.distribution.trim();
    emits.push(
      emitQa({
        key: "distribution",
        question: `What is the distribution of ${species}?`,
        back,
        excerpt: `Distribution: ${back}`,
        predicate: "has distribution",
      }),
    );
  }

  if (f.diagnosticStage?.trim()) {
    const back = f.diagnosticStage.trim();
    emits.push(
      emitQa({
        key: "diagnosticStage",
        question: `What is the diagnostic stage of ${species}?`,
        back,
        excerpt: `Diagnostic stage: ${back}`,
        predicate: "has diagnostic stage",
      }),
    );
  }

  if (f.pppDays) {
    const back = formatPpp(f.pppDays);
    emits.push(
      emitQa({
        key: "pppDays",
        question: `What is the PPP of ${species}?`,
        back,
        excerpt: `PPP: ${back}`,
        predicate: "has PPP",
      }),
    );
  }

  const claims: StudyClaim[] = [];
  const drafts: CardDraft[] = [];
  const coveredFieldKeys: string[] = [];

  for (const item of emits) {
    coveredFieldKeys.push(item.key);
    claims.push({
      subject: species,
      predicate: item.predicate,
      object: item.object,
      source_span: item.excerpt,
    });
    drafts.push({
      type: "qa",
      front: item.front,
      back: item.back,
      provenance: { pages: [], excerpt: item.excerpt },
    });
  }

  return { claims, drafts, coveredFieldKeys };
}
