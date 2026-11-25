import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  resetTestDb,
  seedCard,
  seedCardsReviewOwner,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("POST /api/cards/:id/reject reason", () => {

  async function seedDraft(env: Bindings) {
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }

  function reject(env: Bindings, body?: string) {
    return app.request(
      "/api/cards/card-draft/reject",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body,
      },
      env,
    );
  }

  const card = async (env: Bindings) =>
    (await getCards(env)).find((c) => c.id === "card-draft");

  it("persists a known reason", async () => {
    const env = cfEnv;
    await seedDraft(env);
    const res = await reject(env, JSON.stringify({ reason: "vague" }));
    expect(res.status).toBe(200);
    expect((await card(env))?.status).toBe("rejected");
    expect((await card(env))?.reject_reason).toBe("vague");
  });

  it("bodyless reject stores no reason", async () => {
    const env = cfEnv;
    await seedDraft(env);
    const res = await reject(env);
    expect(res.status).toBe(200);
    expect((await card(env))?.status).toBe("rejected");
    expect((await card(env))?.reject_reason ?? null).toBeNull();
  });

  it("unknown reason is 400 and the card stays a draft", async () => {
    const env = cfEnv;
    await seedDraft(env);
    const res = await reject(env, JSON.stringify({ reason: "nope" }));
    expect(res.status).toBe(400);
    expect((await card(env))?.status).toBe("draft");
  });

  it("undo-review restores a rejected card to draft", async () => {
    const env = cfEnv;
    await seedDraft(env);
    expect(
      (await reject(env, JSON.stringify({ reason: "vague" }))).status,
    ).toBe(200);
    const undo = await app.request(
      "/api/cards/card-draft/undo-review",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(undo.status).toBe(200);
    expect((await card(env))?.status).toBe("draft");
    expect((await card(env))?.reject_reason ?? null).toBeNull();
  });

  it("malformed JSON is 400", async () => {
    const env = cfEnv;
    await seedDraft(env);
    const res = await reject(env, "{not json");
    expect(res.status).toBe(400);
    expect((await card(env))?.status).toBe("draft");
  });
});
