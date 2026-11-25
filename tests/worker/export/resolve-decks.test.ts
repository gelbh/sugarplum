import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedDeck,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExportDeckIds } from "../../../worker/export/resolveExportDecks";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const userA = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const userB = {
  id: "user-b",
  email: "b@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

async function seedOwnedLibrary() {
  const env = cfEnv;
  await seedUser(env, userA);
  await seedUser(env, userB);

  await seedSubject(env, {
    id: "subject-a",
    user_id: userA.id,
    title: "Anatomy",
    created_at: userA.created_at,
  });
  await seedDeck(env, {
    id: "deck-a1",
    user_id: userA.id,
    title: "Bones",
    subject_hint: null,
    subject_id: "subject-a",
    created_at: "2026-01-01T00:00:01.000Z",
  });
  await seedDeck(env, {
    id: "deck-a2",
    user_id: userA.id,
    title: "Muscles",
    subject_hint: null,
    subject_id: "subject-a",
    created_at: "2026-01-01T00:00:02.000Z",
  });
  await seedDeck(env, {
    id: "deck-solo",
    user_id: userA.id,
    title: "Loose deck",
    subject_hint: null,
    subject_id: null,
    created_at: "2026-01-01T00:00:03.000Z",
  });

  await seedSubject(env, {
    id: "subject-b",
    user_id: userB.id,
    title: "Foreign",
    created_at: userB.created_at,
  });
  await seedDeck(env, {
    id: "deck-b1",
    user_id: userB.id,
    title: "Other bones",
    subject_hint: null,
    subject_id: "subject-b",
    created_at: userB.created_at,
  });

  return env;
}

describe("resolveExportDeckIds", () => {
  it("expands a subject to owned decks in created_at order", async () => {
    const env = await seedOwnedLibrary();

    const ids = await resolveExportDeckIds(env, userA.id, {
      type: "subject",
      subjectId: "subject-a",
    });

    expect(ids).toEqual(["deck-a1", "deck-a2"]);
  });

  it("unions selection subjects and decks, deduping first-seen order", async () => {
    const env = await seedOwnedLibrary();

    const ids = await resolveExportDeckIds(env, userA.id, {
      type: "selection",
      subjectIds: ["subject-a"],
      deckIds: ["deck-a2", "deck-solo", "deck-a1"],
    });

    expect(ids).toEqual(["deck-a1", "deck-a2", "deck-solo"]);
  });

  it("yields [] for a foreign subject", async () => {
    const env = await seedOwnedLibrary();

    const ids = await resolveExportDeckIds(env, userA.id, {
      type: "subject",
      subjectId: "subject-b",
    });

    expect(ids).toEqual([]);
  });

  it("keeps owned deck-only selection and omits foreign deck ids", async () => {
    const env = await seedOwnedLibrary();

    const ids = await resolveExportDeckIds(env, userA.id, {
      type: "selection",
      subjectIds: [],
      deckIds: ["deck-solo", "deck-b1", "missing"],
    });

    expect(ids).toEqual(["deck-solo"]);
  });

  it("returns the deck id for deck scope without soft-omitting", async () => {
    const env = await seedOwnedLibrary();

    const ids = await resolveExportDeckIds(env, userA.id, {
      type: "deck",
      deckId: "deck-b1",
    });

    expect(ids).toEqual(["deck-b1"]);
  });
});
