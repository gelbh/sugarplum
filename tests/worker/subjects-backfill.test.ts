import { describe, it, expect } from "vitest";
import {
  backfillDeckSubjects,
  subjectTitleFromHint,
  type BackfillDeck,
  type BackfillSubject,
} from "../../worker/subjects/backfill";

describe("subjectTitleFromHint", () => {
  it("uses trimmed hint or Unfiled", () => {
    expect(subjectTitleFromHint(" Anatomy ")).toBe("Anatomy");
    expect(subjectTitleFromHint("")).toBe("Unfiled");
    expect(subjectTitleFromHint(null)).toBe("Unfiled");
    expect(subjectTitleFromHint(undefined)).toBe("Unfiled");
    expect(subjectTitleFromHint("   ")).toBe("Unfiled");
  });
});

describe("backfillDeckSubjects", () => {
  it("attaches legacy null subject_id decks from subject_hint and creates subjects", () => {
    const decks: BackfillDeck[] = [
      {
        id: "deck-hint",
        user_id: "user-a",
        title: "Bones",
        subject_hint: "Anatomy",
        subject_id: null,
        created_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "deck-blank",
        user_id: "user-a",
        title: "Misc",
        subject_hint: null,
        subject_id: null,
        created_at: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "deck-other-user",
        user_id: "user-b",
        title: "X",
        subject_hint: "Anatomy",
        subject_id: null,
        created_at: "2026-01-04T00:00:00.000Z",
      },
    ];
    const subjects: BackfillSubject[] = [];
    let n = 0;
    const { decks: nextDecks, subjects: nextSubjects } = backfillDeckSubjects(
      decks,
      subjects,
      () => `sub-${++n}`,
    );

    expect(nextDecks.every((d) => d.subject_id != null)).toBe(true);
    expect(nextDecks.every((d) => d.subject_hint === null)).toBe(true);

    const byId = Object.fromEntries(nextDecks.map((d) => [d.id, d]));
    const anatomyA = nextSubjects.find(
      (s) => s.user_id === "user-a" && s.title === "Anatomy",
    );
    const unfiledA = nextSubjects.find(
      (s) => s.user_id === "user-a" && s.title === "Unfiled",
    );
    const anatomyB = nextSubjects.find(
      (s) => s.user_id === "user-b" && s.title === "Anatomy",
    );
    expect(anatomyA).toBeTruthy();
    expect(unfiledA).toBeTruthy();
    expect(anatomyB).toBeTruthy();
    expect(anatomyA!.id).not.toBe(anatomyB!.id);

    expect(byId["deck-hint"]?.subject_id).toBe(anatomyA!.id);
    expect(byId["deck-blank"]?.subject_id).toBe(unfiledA!.id);
    expect(byId["deck-other-user"]?.subject_id).toBe(anatomyB!.id);
  });

  it("reuses an existing subject with the same title for the user", () => {
    const existing: BackfillSubject = {
      id: "sub-existing",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const decks: BackfillDeck[] = [
      {
        id: "legacy",
        user_id: "user-a",
        title: "Bones",
        subject_hint: "Anatomy",
        subject_id: null,
        created_at: "2026-01-05T00:00:00.000Z",
      },
    ];

    const { decks: nextDecks, subjects: nextSubjects } = backfillDeckSubjects(
      decks,
      [existing],
      () => "should-not-run",
    );

    expect(nextSubjects).toHaveLength(1);
    expect(nextDecks[0]?.subject_id).toBe("sub-existing");
    expect(nextDecks[0]?.subject_hint).toBeNull();
  });

  it("leaves decks that already have subject_id unchanged", () => {
    const decks: BackfillDeck[] = [
      {
        id: "ok",
        user_id: "user-a",
        title: "T",
        subject_hint: "Ignored",
        subject_id: "sub-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const subjects: BackfillSubject[] = [
      {
        id: "sub-1",
        user_id: "user-a",
        title: "Anatomy",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];

    const { decks: nextDecks, subjects: nextSubjects } = backfillDeckSubjects(
      decks,
      subjects,
      () => "nope",
    );

    expect(nextDecks[0]).toEqual(decks[0]);
    expect(nextSubjects).toEqual(subjects);
  });
});
