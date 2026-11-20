import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { flagAcceptedCardsForHygiene } from "../../worker/generation/deck-hygiene";
import { createTestEnv } from "./test-env";

const NOW = "2026-11-19T12:00:00.000Z";

describe("flagAcceptedCardsForHygiene", () => {
  it("flags essay and compound accepted cards", () => {
    const essayBack = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    const flagged = flagAcceptedCardsForHygiene([
      {
        id: "essay",
        type: "qa",
        front_json: JSON.stringify("What is lysozyme?"),
        back_json: JSON.stringify(essayBack),
        provenance_json: null,
        media_r2_keys_json: null,
      },
      {
        id: "compound",
        type: "qa",
        front_json: JSON.stringify("What is X and what is Y?"),
        back_json: JSON.stringify("Two things"),
        provenance_json: null,
        media_r2_keys_json: null,
      },
      {
        id: "safe",
        type: "qa",
        front_json: JSON.stringify("What digests peptidoglycan?"),
        back_json: JSON.stringify("Lysozyme"),
        provenance_json: null,
        media_r2_keys_json: null,
      },
    ]);
    expect(flagged.map((c) => c.id).sort()).toEqual(["compound", "essay"]);
    expect(flagged.find((c) => c.id === "essay")!.reasons).toContain(
      "essay_back",
    );
    expect(flagged.find((c) => c.id === "compound")!.reasons).toContain(
      "compound_front",
    );
  });
});

describe("GET /api/decks/:id/hygiene", () => {
  it("returns flagged accepted cards for the owner", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "u1@example.com",
      password_hash: null,
      oauth_subject: "g-u1",
      created_at: NOW,
    });
    env.seedSession("s1", "u1");
    env.seedDeck({
      id: "deck-1",
      user_id: "u1",
      title: "Imm",
      subject_hint: null,
      subject_id: null,
      created_at: NOW,
    });
    const essayBack = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    env.seedCard({
      id: "c-essay",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("What is lysozyme?"),
      back_json: JSON.stringify(essayBack),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });
    env.seedCard({
      id: "c-safe",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("What digests peptidoglycan?"),
      back_json: JSON.stringify("Lysozyme"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });

    const res = await app.request("/api/decks/deck-1/hygiene", {
      headers: { cookie: `${SESSION_COOKIE}=s1` },
    }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{ id: string }>;
      summary: { flagged: number };
    };
    expect(body.summary.flagged).toBe(1);
    expect(body.cards.map((c) => c.id)).toEqual(["c-essay"]);
  });

  it("includes regen_op when a queued/running op exists", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "u1@example.com",
      password_hash: null,
      oauth_subject: "g-u1",
      created_at: NOW,
    });
    env.seedSession("s1", "u1");
    env.seedDeck({
      id: "deck-1",
      user_id: "u1",
      title: "Imm",
      subject_hint: null,
      subject_id: null,
      created_at: NOW,
    });
    const essayBack = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    env.seedCard({
      id: "c-essay",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("What is lysozyme?"),
      back_json: JSON.stringify(essayBack),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });
    env.seedCardRegenOp({
      id: "op-1",
      card_id: "c-essay",
      user_id: "u1",
      regen_type: "qa",
      status: "running",
      error: null,
      created_at: NOW,
      finished_at: null,
    });

    const res = await app.request("/api/decks/deck-1/hygiene", {
      headers: { cookie: `${SESSION_COOKIE}=s1` },
    }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{
        id: string;
        regen_op?: { id: string; status: string };
      }>;
    };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]!.regen_op).toEqual({
      id: "op-1",
      status: "running",
    });
  });

  it("404s for non-owner", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "u1@example.com",
      password_hash: null,
      oauth_subject: "g-u1",
      created_at: NOW,
    });
    env.seedUser({
      id: "u2",
      email: "u2@example.com",
      password_hash: null,
      oauth_subject: "g-u2",
      created_at: NOW,
    });
    env.seedSession("s2", "u2");
    env.seedDeck({
      id: "deck-1",
      user_id: "u1",
      title: "Imm",
      subject_hint: null,
      subject_id: null,
      created_at: NOW,
    });

    const res = await app.request("/api/decks/deck-1/hygiene", {
      headers: { cookie: `${SESSION_COOKIE}=s2` },
    }, env);
    expect(res.status).toBe(404);
  });
});
