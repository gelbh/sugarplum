import type { Subject } from "../api/client";

/**
 * Subject delete is blocked when the API reports decks or, if deck_count is
 * missing, when locally loaded decks exist (Library: per-subject slice; Subject
 * page: decks for this subject).
 */
export function subjectDeleteBlocked(
  subject: Pick<Subject, "deck_count">,
  localDeckCount: number,
): boolean {
  return (subject.deck_count ?? localDeckCount) > 0;
}

export function effectiveSubjectDeckCount(
  subject: Pick<Subject, "deck_count">,
  localDeckCount: number,
): number {
  return subject.deck_count ?? localDeckCount;
}
