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
    .map((n) => searchable(collapseSeparators(n)));
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
