import { describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";
import { NOTE_MAX_CHARS } from "../../../worker/atlas/notes";
import type { AtlasEntryView } from "../../../src/atlas/types";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
  env.seedSubject({
    id: "sub-1",
    user_id: "user-a",
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function createAtlas(env: ReturnType<typeof createTestEnv>) {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: authHeaders() },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe("atlas entry personal notes", () => {
  it("PUT note on dataset entry does not create overlay; list returns personalNote", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const { id: atlasId } = await createAtlas(env);

    const put = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: "Remember miracidium" }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const view = (await put.json()) as AtlasEntryView;
    expect(view.id).toBe("fasciola-hepatica");
    expect(view.editedAt).toBeNull();
    expect(view.personalNote).toBe("Remember miracidium");

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const listed = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(listed?.personalNote).toBe("Remember miracidium");
    expect(listed?.editedAt).toBeNull();
  });

  it("Reset clears field edits but keeps personalNote", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const { id: atlasId } = await createAtlas(env);

    await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: "Keep me" }),
      },
      env,
    );

    const patch = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          commonName: "Temp",
          fields: { definitiveHosts: ["sheep"] },
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const edited = (await patch.json()) as AtlasEntryView;
    expect(edited.personalNote).toBe("Keep me");

    const reset = await app.request(
      `/api/atlas/${atlasId}/entries/${edited.id}/reset`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(reset.status).toBe(204);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(view?.editedAt).toBeNull();
    expect(view?.personalNote).toBe("Keep me");
  });

  it("whitespace PUT and DELETE clear the note", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const { id: atlasId } = await createAtlas(env);

    await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: "temp" }),
      },
      env,
    );

    const clear = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: "   " }),
      },
      env,
    );
    expect(clear.status).toBe(200);
    expect(((await clear.json()) as AtlasEntryView).personalNote).toBeNull();

    await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: "again" }),
      },
      env,
    );
    const del = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(del.status).toBe(200);
    expect(((await del.json()) as AtlasEntryView).personalNote).toBeNull();
  });

  it("rejects body over NOTE_MAX_CHARS", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const { id: atlasId } = await createAtlas(env);

    const tooLong = "x".repeat(NOTE_MAX_CHARS + 1);
    const res = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/note`,
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ body: tooLong }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
