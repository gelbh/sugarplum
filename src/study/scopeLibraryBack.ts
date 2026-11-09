import type { DueScopeOpts } from "./dueCache";

export function scopeLibraryBack(scope: DueScopeOpts): {
  href: string;
  label: string;
} {
  const deck = Boolean(scope.deckId);
  const id = (deck ? scope.deckId : scope.subjectId) ?? "";
  return {
    href: deck
      ? `/library/decks/${encodeURIComponent(id)}`
      : `/library/subjects/${encodeURIComponent(id)}`,
    label: `Back to ${deck ? "deck" : "subject"}`,
  };
}
