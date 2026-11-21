export const searchable = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

/** Slides abbreviate the genus ("F. hepatica"), so that form matches too. */
export function genusInitialForms(canonicalName: string): string[] {
  const [genus, species] = canonicalName.split(" ");
  if (!species || species === "spp.") return [];
  const initial = genus[0].toLowerCase();
  return [`${initial}. ${species}`, `${initial} ${species}`];
}

export type NameMatchEntry = {
  canonicalName: string;
  commonName: string | null;
  aliases: string[];
};

export const collapseSeparators = (s: string) => s.replace(/[_-]+/g, " ");

export function entryNameForms(entry: NameMatchEntry): string[] {
  const names = [entry.canonicalName, entry.commonName, ...entry.aliases]
    .filter((n): n is string => n !== null)
    .map((n) => searchable(collapseSeparators(n)))
    // An empty form would match every haystack.
    .filter((n) => n !== "");
  return [...names, ...genusInitialForms(entry.canonicalName)];
}

export function textMentionsEntry(
  haystack: string,
  forms: readonly string[],
): boolean {
  // Filenames often use Fasciola_hepatica / F._hepatica; treat _ and - as spaces.
  const hay = searchable(collapseSeparators(haystack));
  return forms.some((form) =>
    hay.includes(searchable(collapseSeparators(form))),
  );
}

export const ALIAS_MAX_ITEMS = 20;
export const ALIAS_MAX_CHARS = 80;
/** Aliases match by raw substring, so a 1-2 letter alias would hit most text. */
const ALIAS_MIN_LETTERS = 3;

/**
 * Trim, drop aliases with fewer than 3 letters once separators collapse, and
 * dedupe by that matched form (first spelling wins).
 */
export function cleanAliasList(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const alias = item.trim();
    const key = searchable(collapseSeparators(alias));
    const letters = key.match(/\p{L}/gu)?.length ?? 0;
    if (letters < ALIAS_MIN_LETTERS || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}
