import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { topicHintsPromptSuffix } from "../../worker/generation/prompts";
import { createTestEnv } from "./test-env";

function seedPasteOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("topicHints on paste", () => {
  it("persists topicHints on the generation job as JSON", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes about the brainstem",
          topicHints: ["cranial nerves"],
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    expect(env.getGenerationJobs()).toHaveLength(1);
    const raw = env.getGenerationJobs()[0]?.topic_hints_json;
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual(["cranial nerves"]);
  });

  it("strips empties and rejects over-cap or over-length topicHints", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);

    const tooMany = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          topicHints: ["a", "b", "c", "d", "e", "f"],
        }),
      },
      env,
    );
    expect(tooMany.status).toBe(400);
    expect(env.getGenerationJobs()).toHaveLength(0);

    const tooLong = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          topicHints: ["x".repeat(201)],
        }),
      },
      env,
    );
    expect(tooLong.status).toBe(400);
  });
});

describe("topicHints prompt suffix", () => {
  it("includes each hint phrase when hints are present", () => {
    const suffix = topicHintsPromptSuffix(["cranial nerves"]);
    expect(suffix.toLowerCase()).toContain("cranial nerves");
    expect(suffix.toLowerCase()).toMatch(/also cover|cover/);
  });

  it("returns empty string when hints are absent", () => {
    expect(topicHintsPromptSuffix([])).toBe("");
  });
});
