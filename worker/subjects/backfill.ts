/**
 * Pure account/D1 subjects backfill (same rules as migrations/0008_subjects_backfill.sql
 * and guest migrateStore). Testable without D1.
 */

export type BackfillSubject = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type BackfillDeck = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
};

export function subjectTitleFromHint(hint: string | null | undefined): string {
  const trimmed = typeof hint === "string" ? hint.trim() : "";
  return trimmed || "Unfiled";
}

function subjectKey(userId: string, title: string): string {
  return `${userId}\0${title}`;
}

/**
 * Assign subject_id for every deck that still has null, creating subjects for
 * hint groups when the user has no subject with that title yet.
 */
export function backfillDeckSubjects(
  decks: readonly BackfillDeck[],
  subjects: readonly BackfillSubject[],
  newId: () => string = () => crypto.randomUUID(),
): { decks: BackfillDeck[]; subjects: BackfillSubject[] } {
  const nextSubjects = subjects.map((s) => ({ ...s }));
  const byUserTitle = new Map<string, BackfillSubject>();

  for (const s of nextSubjects) {
    const key = subjectKey(s.user_id, s.title);
    const prev = byUserTitle.get(key);
    if (
      !prev ||
      s.created_at < prev.created_at ||
      (s.created_at === prev.created_at && s.id < prev.id)
    ) {
      byUserTitle.set(key, s);
    }
  }

  const nextDecks = decks.map((d) => {
    if (d.subject_id) {
      return {
        ...d,
        subject_id: d.subject_id,
        subject_hint: d.subject_hint,
      };
    }

    const title = subjectTitleFromHint(d.subject_hint);
    const key = subjectKey(d.user_id, title);
    let subject = byUserTitle.get(key);
    if (!subject) {
      subject = {
        id: newId(),
        user_id: d.user_id,
        title,
        created_at: d.created_at,
      };
      nextSubjects.push(subject);
      byUserTitle.set(key, subject);
    }

    return {
      ...d,
      subject_id: subject.id,
      subject_hint: null,
    };
  });

  return { decks: nextDecks, subjects: nextSubjects };
}
