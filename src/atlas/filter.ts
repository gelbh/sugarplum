import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
} from "../../worker/atlas/datasets/vocab";
import { PARASITE_GROUPS } from "../../worker/atlas/templates/parasite";
import type { AtlasEntryView, ParasiteGroup } from "./types";

export type AtlasFilters = {
  groups: ParasiteGroup[];
  host: string | null;
  organ: string | null;
  zoonoticOnly: boolean;
};

export const NO_FILTERS: AtlasFilters = {
  groups: [],
  host: null,
  organ: null,
  zoonoticOnly: false,
};

export const GROUP_LABELS: Record<
  ParasiteGroup,
  { plural: string; common: string }
> = {
  protozoan: { plural: "Protozoa", common: "Single-celled parasites" },
  nematode: { plural: "Nematodes", common: "Roundworms" },
  cestode: { plural: "Cestodes", common: "Tapeworms" },
  trematode: { plural: "Trematodes", common: "Flukes" },
  arthropod: { plural: "Arthropods", common: "Mites, ticks and insects" },
};

const searchable = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Slides abbreviate the genus ("F. hepatica"), so that form matches too. */
function genusInitialForms(canonicalName: string): string[] {
  const [genus, species] = canonicalName.split(" ");
  if (!species || species === "spp.") return [];
  const initial = genus[0].toLowerCase();
  return [`${initial}. ${species}`, `${initial} ${species}`];
}

export function matchesSearch(entry: AtlasEntryView, q: string): boolean {
  const needle = searchable(q);
  if (needle === "") return true;
  const names = [entry.canonicalName, entry.commonName, ...entry.aliases]
    .filter((n): n is string => n !== null)
    .map(searchable);
  return [...names, ...genusInitialForms(entry.canonicalName)].some((n) =>
    n.includes(needle),
  );
}

export const entryHosts = (e: AtlasEntryView) => [
  ...e.fields.definitiveHosts,
  ...e.fields.intermediateHosts,
  ...e.fields.paratenicHosts,
];

export function applyFilters(
  entries: AtlasEntryView[],
  f: AtlasFilters,
): AtlasEntryView[] {
  return entries.filter((e) => {
    if (f.groups.length > 0 && !f.groups.includes(e.fields.group)) return false;
    if (f.host !== null) {
      const host = f.host;
      if (!entryHosts(e).some((h) => hostCovers(host, h))) return false;
    }
    if (f.organ !== null) {
      const organ = e.fields.majorOrgan;
      if (organ === null || !organCovers(f.organ, organ)) return false;
    }
    // "potential" zoonoses count: a vet student needs them flagged too.
    return !f.zoonoticOnly || (e.fields.zoonotic ?? "no") !== "no";
  });
}

export const filtersActive = (f: AtlasFilters) =>
  f.groups.length > 0 || f.host !== null || f.organ !== null || f.zoonoticOnly;

export const byName = (a: AtlasEntryView, b: AtlasEntryView) =>
  a.canonicalName.localeCompare(b.canonicalName);

export function groupRows(
  entries: AtlasEntryView[],
): { group: ParasiteGroup; entries: AtlasEntryView[] }[] {
  return PARASITE_GROUPS.map((group) => ({
    group,
    entries: entries.filter((e) => e.fields.group === group).sort(byName),
  })).filter((row) => row.entries.length > 0);
}

export function presentGroups(entries: AtlasEntryView[]): ParasiteGroup[] {
  return groupRows(entries).map((row) => row.group);
}

export type TableColumn = "name" | "group" | "host" | "site" | "ppp";
export type SortDir = "asc" | "desc";

function sortValue(
  e: AtlasEntryView,
  column: TableColumn,
): string | number | null {
  switch (column) {
    case "name":
      return e.canonicalName;
    case "group":
      return e.fields.group
        ? PARASITE_GROUPS.indexOf(e.fields.group)
        : -1;
    case "host":
      return e.fields.definitiveHosts[0] ?? null;
    case "site":
      return e.fields.majorOrgan;
    case "ppp":
      return e.fields.pppDays?.min ?? null;
  }
}

/** Stable sort; entries missing the column value go last in both directions. */
export function sortTable(
  entries: AtlasEntryView[],
  column: TableColumn,
  dir: SortDir,
): AtlasEntryView[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = sortValue(a, column);
    const vb = sortValue(b, column);
    if (va === null || vb === null) {
      if (va === vb) return byName(a, b);
      return va === null ? 1 : -1;
    }
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return cmp !== 0 ? sign * cmp : byName(a, b);
  });
}

export type TermOption = { term: string; depth: number };

type Vocab = Record<string, { readonly broader: readonly string[] }>;

/**
 * Terms used by the entries plus every broader term, as a tree in vocabulary
 * order, so the menu offers "mammal" above "dog" and never a term with no match.
 */
function termTree(vocab: Vocab, used: Iterable<string>): TermOption[] {
  const keep = new Set<string>();
  const climb = (t: string) => {
    if (keep.has(t) || !Object.hasOwn(vocab, t)) return;
    keep.add(t);
    vocab[t].broader.forEach(climb);
  };
  for (const t of used) climb(t);
  const terms = Object.keys(vocab).filter((t) => keep.has(t));
  const children = (parent: string | null) =>
    terms.filter((t) => {
      const broader = vocab[t].broader.filter((b) => keep.has(b));
      return parent === null ? broader.length === 0 : broader[0] === parent;
    });
  const out: TermOption[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of children(parent)) {
      out.push({ term: t, depth });
      walk(t, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function hostOptions(entries: AtlasEntryView[]): TermOption[] {
  return termTree(HOST_TERMS, entries.flatMap(entryHosts));
}

export function organOptions(entries: AtlasEntryView[]): TermOption[] {
  return termTree(
    ORGAN_TERMS,
    entries.flatMap((e) => (e.fields.majorOrgan ? [e.fields.majorOrgan] : [])),
  );
}

/** Vocabulary taxa ("Galba truncatula", "Radix") are capitalised; render them in italics. */
export const isTaxonTerm = (term: string) => /^[A-Z]/.test(term);

export const termLabel = (term: string) =>
  isTaxonTerm(term) ? term : term[0].toUpperCase() + term.slice(1);

export function hostSummary(hosts: string[], max = 2): string {
  if (hosts.length === 0) return "";
  const shown = hosts.slice(0, max).join(", ");
  const rest = hosts.length - max;
  const text = rest > 0 ? `${shown} +${rest}` : shown;
  return isTaxonTerm(text) ? text : text[0].toUpperCase() + text.slice(1);
}

export function pppLabel(
  ppp: { min: number; max: number } | null,
): string | null {
  if (ppp === null) return null;
  return ppp.min === ppp.max
    ? `${ppp.min} days`
    : `${ppp.min} to ${ppp.max} days`;
}
