import { describe, expect, it } from "vitest";
import {
  EXPORT_SYNC_MAX_CARDS,
  EXPORT_SYNC_MAX_DECKS,
  EXPORT_SYNC_MAX_MEDIA_BYTES,
  EXPORT_UNKNOWN_MEDIA_BYTES,
  estimateExportWorkload,
  shouldEnqueueExport,
} from "../../worker/export/threshold";
import { createTestEnv } from "./test-env";

const user = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function setupDeck(env: ReturnType<typeof createTestEnv>, deckId = "deck-a") {
  env.seedUser(user);
  env.seedDeck({
    id: deckId,
    user_id: user.id,
    title: "Bones",
    subject_hint: null,
    subject_id: null,
    created_at: user.created_at,
  });
}

describe("shouldEnqueueExport", () => {
  it("stays sync under all thresholds", () => {
    expect(
      shouldEnqueueExport({
        deckCount: EXPORT_SYNC_MAX_DECKS,
        cardCount: EXPORT_SYNC_MAX_CARDS,
        mediaBytes: EXPORT_SYNC_MAX_MEDIA_BYTES,
      }),
    ).toBe(false);
  });

  it("enqueues when any limit is exceeded", () => {
    expect(
      shouldEnqueueExport({
        deckCount: EXPORT_SYNC_MAX_DECKS + 1,
        cardCount: 1,
        mediaBytes: 0,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueExport({
        deckCount: 1,
        cardCount: EXPORT_SYNC_MAX_CARDS + 1,
        mediaBytes: 0,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueExport({
        deckCount: 1,
        cardCount: 1,
        mediaBytes: EXPORT_SYNC_MAX_MEDIA_BYTES + 1,
      }),
    ).toBe(true);
  });
});

describe("estimateExportWorkload", () => {
  it("counts accepted cards and zero media for a small deck", async () => {
    const env = createTestEnv();
    setupDeck(env);
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: user.created_at,
      updated_at: user.created_at,
    });
    env.seedCard({
      id: "card-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: user.created_at,
      updated_at: user.created_at,
    });

    const w = await estimateExportWorkload(env, user.id, ["deck-a"]);
    expect(w).toEqual({ deckCount: 1, cardCount: 1, mediaBytes: 0 });
    expect(shouldEnqueueExport(w)).toBe(false);
  });

  it("sums R2 head sizes for media keys", async () => {
    const env = createTestEnv();
    setupDeck(env);
    const key = "materials/deck-a/fig.png";
    env.seedR2(key, "x".repeat(4096));
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: JSON.stringify([key]),
      provenance_json: null,
      status: "accepted",
      created_at: user.created_at,
      updated_at: user.created_at,
    });

    const w = await estimateExportWorkload(env, user.id, ["deck-a"]);
    expect(w.cardCount).toBe(1);
    expect(w.mediaBytes).toBe(4096);
  });

  it("counts unknown media heads as 1 MiB each", async () => {
    const env = createTestEnv();
    setupDeck(env);
    const key = "materials/deck-a/missing.png";
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: JSON.stringify([key]),
      provenance_json: null,
      status: "accepted",
      created_at: user.created_at,
      updated_at: user.created_at,
    });

    const w = await estimateExportWorkload(env, user.id, ["deck-a"]);
    expect(w.mediaBytes).toBe(EXPORT_UNKNOWN_MEDIA_BYTES);
  });

  it("reports over-card workload for 201 accepted cards", async () => {
    const env = createTestEnv();
    setupDeck(env);
    for (let i = 0; i < EXPORT_SYNC_MAX_CARDS + 1; i++) {
      env.seedCard({
        id: `card-${i}`,
        deck_id: "deck-a",
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`Q${i}`),
        back_json: JSON.stringify(`A${i}`),
        media_r2_keys_json: null,
        provenance_json: null,
        status: "accepted",
        created_at: user.created_at,
        updated_at: user.created_at,
      });
    }

    const w = await estimateExportWorkload(env, user.id, ["deck-a"]);
    expect(w.cardCount).toBe(EXPORT_SYNC_MAX_CARDS + 1);
    expect(shouldEnqueueExport(w)).toBe(true);
  });

  it("reports over-deck workload from deck id count", async () => {
    const env = createTestEnv();
    setupDeck(env);
    const deckIds = Array.from(
      { length: EXPORT_SYNC_MAX_DECKS + 1 },
      (_, i) => `deck-${i}`,
    );
    for (const id of deckIds) {
      env.seedDeck({
        id,
        user_id: user.id,
        title: id,
        subject_hint: null,
        subject_id: null,
        created_at: user.created_at,
      });
    }

    const w = await estimateExportWorkload(env, user.id, deckIds);
    expect(w.deckCount).toBe(EXPORT_SYNC_MAX_DECKS + 1);
    expect(shouldEnqueueExport(w)).toBe(true);
  });

  it("ignores foreign decks in the workload estimate", async () => {
    const env = createTestEnv();
    setupDeck(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: user.created_at,
    });
    env.seedDeck({
      id: "deck-foreign",
      user_id: "user-b",
      title: "Foreign",
      subject_hint: null,
      subject_id: null,
      created_at: user.created_at,
    });
    for (let i = 0; i < EXPORT_SYNC_MAX_CARDS + 1; i++) {
      env.seedCard({
        id: `foreign-card-${i}`,
        deck_id: "deck-foreign",
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`Q${i}`),
        back_json: JSON.stringify(`A${i}`),
        media_r2_keys_json: null,
        provenance_json: null,
        status: "accepted",
        created_at: user.created_at,
        updated_at: user.created_at,
      });
    }

    const w = await estimateExportWorkload(env, user.id, ["deck-foreign"]);
    expect(w).toEqual({ deckCount: 0, cardCount: 0, mediaBytes: 0 });
    expect(shouldEnqueueExport(w)).toBe(false);
  });
});
