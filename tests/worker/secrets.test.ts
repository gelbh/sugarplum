import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  apiKeyLast4,
  decryptSecret,
  encryptSecret,
  parseSecretMeta,
  wrapKeyBytes,
} from "../../worker/crypto/secrets";
import { createTestEnv, TEST_SECRETS_WRAP_KEY } from "./test-env";

describe("secrets crypto", () => {
  it("accepts a 32-byte UTF-8 wrap key", () => {
    expect(wrapKeyBytes(TEST_SECRETS_WRAP_KEY).byteLength).toBe(32);
  });

  it("round-trips encrypt/decrypt", async () => {
    const apiKey = "sk-test-secret-key-abc123xyz";
    const packed = await encryptSecret(apiKey, TEST_SECRETS_WRAP_KEY);
    expect(packed.startsWith("aes-gcm$")).toBe(true);
    expect(packed.includes(apiKey)).toBe(false);
    expect(await decryptSecret(packed, TEST_SECRETS_WRAP_KEY)).toBe(apiKey);
    expect(parseSecretMeta(packed)).toEqual({ last4: apiKeyLast4(apiKey) });
  });
});

describe("GET/PUT /api/settings/llm", () => {
  function seedUser(env: ReturnType<typeof createTestEnv>) {
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
  }

  it("PUT stores ciphertext and GET never includes the raw key", async () => {
    const env = createTestEnv();
    seedUser(env);
    const apiKey = "sk-live-never-return-this-key";
    const last4 = apiKeyLast4(apiKey);

    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ provider: "openai", apiKey }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as Record<string, unknown>;
    expect(putBody).toEqual({
      provider: "openai",
      last4,
      configured: true,
    });
    expect(JSON.stringify(putBody)).not.toContain(apiKey);

    const stored = env.getUserSecrets();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.ciphertext.includes(apiKey)).toBe(false);
    expect(await decryptSecret(stored[0]!.ciphertext, env.SECRETS_WRAP_KEY)).toBe(
      apiKey,
    );

    const getRes = await app.request(
      "/api/settings/llm",
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as Record<string, unknown>;
    expect(getBody).toEqual({
      provider: "openai",
      last4,
      configured: true,
    });
    expect(JSON.stringify(getBody)).not.toContain(apiKey);
    expect(getBody).not.toHaveProperty("apiKey");
    expect(getBody).not.toHaveProperty("ciphertext");
  });

  it("GET returns configured:false when no secret stored", async () => {
    const env = createTestEnv();
    seedUser(env);

    const getRes = await app.request(
      "/api/settings/llm",
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ configured: false });
  });

  it("derives fixed wrap key in harness when SECRETS_WRAP_KEY would be missing", () => {
    const env = createTestEnv();
    expect(env.SECRETS_WRAP_KEY).toBe(TEST_SECRETS_WRAP_KEY);
    expect(env.SECRETS_WRAP_KEY.length).toBe(32);
  });
});
