import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import {
  appendExtraUserSuffix,
  buildExtraUserSuffix,
  topicHintsPromptSuffix,
} from "../../../worker/generation/feedback-hints";
import { generateUserPrompt } from "../../../worker/generation/prompts";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedPasteOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("topicHints on paste", () => {
  it("persists topicHints on the generation job as JSON", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);

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
    expect((await getGenerationJobs(env))).toHaveLength(1);
    const raw = (await getGenerationJobs(env))[0]?.topic_hints_json;
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual(["cranial nerves"]);
  });

  it("strips empties and rejects over-cap or over-length topicHints", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);

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
          topicHints: Array.from({ length: 21 }, (_, i) => `h${i}`),
        }),
      },
      env,
    );
    expect(tooMany.status).toBe(400);
    expect((await getGenerationJobs(env))).toHaveLength(0);

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
          topicHints: ["x".repeat(301)],
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
    expect(suffix.toLowerCase()).toMatch(/steer|cover|prefer/);
    expect(suffix.toLowerCase()).toMatch(/grounded/);
    expect(suffix.toLowerCase()).toMatch(/do not invent/);
  });

  it("tells the model to skip unmatched objectives without emptying the result", () => {
    const suffix = topicHintsPromptSuffix(["cranial nerves"]).toLowerCase();
    expect(suffix).toMatch(/skip (that |the )?objective|unmatched|no grounded support/);
    expect(suffix).toMatch(/still produce|other grounded/);
    expect(suffix).toMatch(/empty array|return an empty/);
  });

  it("puts each hint on its own bullet line", () => {
    const suffix = topicHintsPromptSuffix(["cranial nerves", "spinal cord"]);
    expect(suffix).toContain("- cranial nerves\n- spinal cord");
    expect(suffix).not.toContain("cranial nerves; spinal cord");
  });

  it("returns empty string when hints are absent", () => {
    expect(topicHintsPromptSuffix([])).toBe("");
  });

  it("built generate user prompt includes the hint phrase", () => {
    const prompt = appendExtraUserSuffix(
      generateUserPrompt("brainstem notes"),
      buildExtraUserSuffix({ topicHints: ["cranial nerves"] }),
    );
    expect(prompt.toLowerCase()).toContain("cranial nerves");
    expect(prompt.toLowerCase()).toMatch(/steer|cover|prefer/);
    expect(prompt).toContain("brainstem notes");
  });
});
