/** Normalize for case-insensitive, whitespace-collapsed substring checks. */
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

/** Searchable name forms for an Atlas entry (canonical, common, aliases, genus-initial). */
export function entryNameForms(entry: NameMatchEntry): string[] {
  const names = [entry.canonicalName, entry.commonName, ...entry.aliases]
    .filter((n): n is string => n !== null)
    .map(searchable);
  return [...names, ...genusInitialForms(entry.canonicalName)];
}

/** True when haystack contains any entry name form (case-insensitive). */
export function textMentionsEntry(
  haystack: string,
  forms: readonly string[],
): boolean {
  // Filenames often use Fasciola_hepatica / F._hepatica; treat _ and - as spaces.
  const hay = searchable(haystack.replace(/[_-]+/g, " "));
  return forms.some((form) => hay.includes(form));
}
