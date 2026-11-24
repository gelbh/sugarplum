import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getUserSecrets,
  resetTestDb,
  seedSession,
  seedUser,
  TEST_SECRETS_WRAP_KEY,
  withTestBindings,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  apiKeyLast4,
  decryptSecret,
  encryptSecret,
  parseSecretMeta,
  wrapKeyBytes,
} from "../../worker/crypto/secrets";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

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

  it("round-trips when last4 contains dollar signs", async () => {
    const apiKey = "sk-test-key-ends-with-$a$b";
    const packed = await encryptSecret(apiKey, TEST_SECRETS_WRAP_KEY);
    expect(apiKeyLast4(apiKey)).toBe("$a$b");
    expect(await decryptSecret(packed, TEST_SECRETS_WRAP_KEY)).toBe(apiKey);
    expect(parseSecretMeta(packed)).toEqual({ last4: "$a$b" });
  });
});

describe("GET/PUT/DELETE /api/settings/llm", () => {
  async function seedOwner(env: Bindings) {
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
  }

  it("rejects unknown provider strings and URL-as-provider", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    for (const provider of ["https://api.openai.com/v1", "openrouter", "mock"]) {
      const res = await app.request(
        "/api/settings/llm",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            cookie: `${SESSION_COOKIE}=sess-a`,
          },
          body: JSON.stringify({ provider, apiKey: "sk-x" }),
        },
        env,
      );
      expect(res.status).toBe(400);
    }
  });

  it("PUT stores ciphertext and GET never includes the raw key", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
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
      model: null,
      configured: true,
    });
    expect(JSON.stringify(putBody)).not.toContain(apiKey);

    const stored = (await getUserSecrets(env));
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
      model: null,
      configured: true,
    });
    expect(JSON.stringify(getBody)).not.toContain(apiKey);
    expect(getBody).not.toHaveProperty("apiKey");
    expect(getBody).not.toHaveProperty("ciphertext");
  });

  it("PUT zai defaults model to glm-4.7-flash when omitted", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ provider: "zai", apiKey: "zai-key-1" }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      provider: "zai",
      model: "glm-4.7-flash",
      configured: true,
    });

    const getRes = await app.request(
      "/api/settings/llm",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({
      provider: "zai",
      model: "glm-4.7-flash",
    });
  });

  it("PUT zai persists allowlisted model glm-4.7", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          provider: "zai",
          apiKey: "zai-key-2",
          model: "glm-4.7",
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      provider: "zai",
      model: "glm-4.7",
    });

    const getRes = await app.request(
      "/api/settings/llm",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await getRes.json()).toMatchObject({ model: "glm-4.7" });
  });

  it("PUT zai rejects unknown model", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          provider: "zai",
          apiKey: "zai-key-3",
          model: "glm-evil",
        }),
      },
      env,
    );
    expect(putRes.status).toBe(400);
  });

  it("PUT openai ignores model and stores null", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const putRes = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          provider: "openai",
          apiKey: "sk-openai",
          model: "gpt-4o",
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      provider: "openai",
      model: null,
    });
  });

  it("GET returns configured:false when no secret stored", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);

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
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    expect(env.SECRETS_WRAP_KEY).toBe(TEST_SECRETS_WRAP_KEY);
    expect(env.SECRETS_WRAP_KEY.length).toBe(32);
  });

  it("DELETE removes the stored key and returns configured false", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const apiKey = "sk-delete-me-please";
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

    const delRes = await app.request(
      "/api/settings/llm",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(delRes.status).toBe(200);
    const body = (await delRes.json()) as Record<string, unknown>;
    expect(body).toEqual({ configured: false });
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(body).not.toHaveProperty("ciphertext");
    expect((await getUserSecrets(env))).toEqual([]);

    const getRes = await app.request(
      "/api/settings/llm",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await getRes.json()).toEqual({ configured: false });
  });

  it("DELETE with no stored key still returns configured false", async () => {
    const env = withTestBindings(cfEnv, { secretsWrapKey: TEST_SECRETS_WRAP_KEY });
    await seedOwner(env);
    const delRes = await app.request(
      "/api/settings/llm",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ configured: false });
  });
});
