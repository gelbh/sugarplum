import { describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites";
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
    "/api/subjects/sub-1/atlas",
    { method: "POST", headers: authHeaders() },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    subjectId: string;
    templateKey: string;
    createdAt: string;
  };
}

describe("atlas owned-subject routes", () => {
  it("returns 401 for unauthenticated create", async () => {
    const env = createTestEnv();
    env.seedSubject({
      id: "sub-1",
      user_id: "user-a",
      title: "Parasitology",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      "/api/subjects/sub-1/atlas",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owner create", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/subjects/sub-1/atlas",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("creates an empty atlas and lists merged dataset entries", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const created = await createAtlas(env);
    expect(created).toMatchObject({
      subjectId: "sub-1",
      templateKey: "parasite",
    });
    expect(created.id).toBeTruthy();

    const again = await app.request(
      "/api/subjects/sub-1/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(again.status).toBe(409);

    const meta = await app.request(
      "/api/subjects/sub-1/atlas",
      { headers: authHeaders() },
      env,
    );
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({
      id: created.id,
      subjectId: "sub-1",
      templateKey: "parasite",
    });

    const list = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const dataset = loadParasiteDataset();
    expect(body.entries).toHaveLength(dataset.entries.length);
    expect(body.entries.some((e) => e.id === "fasciola-hepatica")).toBe(true);
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica")?.editedAt,
    ).toBeNull();
  });

  it("returns 404 for entries when atlas is missing", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const res = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("persists an edit over a dataset entry", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);

    const patch = await app.request(
      "/api/subjects/sub-1/atlas/entries/fasciola-hepatica",
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          commonName: "Liver fluke (edited)",
          fields: { family: "Editedidae", group: "trematode" },
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const edited = (await patch.json()) as AtlasEntryView;
    expect(edited.originKey).toBe("fasciola-hepatica");
    expect(edited.commonName).toBe("Liver fluke (edited)");
    expect(edited.fields.family).toBe("Editedidae");
    expect(edited.editedAt).toBeTruthy();
    expect(edited.id).not.toBe("fasciola-hepatica");

    const list = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.originKey === "fasciola-hepatica");
    expect(view?.commonName).toBe("Liver fluke (edited)");
    expect(view?.id).toBe(edited.id);
  });

  it("soft-deletes, restores pristine dataset id, and resets overlay edits", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);

    const soft = await app.request(
      "/api/subjects/sub-1/atlas/entries/fasciola-hepatica/soft-delete",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const hidden = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const hiddenBody = (await hidden.json()) as { entries: AtlasEntryView[] };
    expect(
      hiddenBody.entries.some((e) => e.originKey === "fasciola-hepatica"),
    ).toBe(false);
    expect(
      hiddenBody.entries.some((e) => e.id === "fasciola-hepatica"),
    ).toBe(false);

    const deleted = await app.request(
      "/api/subjects/sub-1/atlas/deleted",
      { headers: authHeaders() },
      env,
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(1);
    expect(deletedBody.entries[0].originKey).toBe("fasciola-hepatica");

    const restore = await app.request(
      `/api/subjects/sub-1/atlas/entries/${deletedBody.entries[0].id}/restore`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(restore.status).toBe(204);

    const afterRestore = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const restoredBody = (await afterRestore.json()) as {
      entries: AtlasEntryView[];
    };
    const pristine = restoredBody.entries.find(
      (e) => e.id === "fasciola-hepatica",
    );
    expect(pristine?.originKey).toBe("fasciola-hepatica");
    expect(pristine?.editedAt).toBeNull();

    const patch = await app.request(
      "/api/subjects/sub-1/atlas/entries/fasciola-hepatica",
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          commonName: "Temp edit",
          fields: { definitiveHosts: ["sheep", "cattle"] },
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const edited = (await patch.json()) as AtlasEntryView;
    expect(edited.fields.definitiveHosts).toEqual(["sheep", "cattle"]);

    const reset = await app.request(
      `/api/subjects/sub-1/atlas/entries/${edited.id}/reset`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(reset.status).toBe(204);

    const list = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(view?.commonName).not.toBe("Temp edit");
    expect(view?.editedAt).toBeNull();
  });

  it("refuses permanent delete of a soft-deleted dataset overlay", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);

    const soft = await app.request(
      "/api/subjects/sub-1/atlas/entries/fasciola-hepatica/soft-delete",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const deleted = await app.request(
      "/api/subjects/sub-1/atlas/deleted",
      { headers: authHeaders() },
      env,
    );
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(1);
    const tombstoneId = deletedBody.entries[0].id;

    const purge = await app.request(
      `/api/subjects/sub-1/atlas/entries/${tombstoneId}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(purge.status).toBe(400);
    const purgeBody = (await purge.json()) as { message?: string };
    expect(purgeBody.message).toMatch(/cannot be permanently deleted/i);

    const stillHidden = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const stillHiddenBody = (await stillHidden.json()) as {
      entries: AtlasEntryView[];
    };
    expect(
      stillHiddenBody.entries.some((e) => e.id === "fasciola-hepatica"),
    ).toBe(false);
    expect(
      stillHiddenBody.entries.some((e) => e.originKey === "fasciola-hepatica"),
    ).toBe(false);

    const stillDeleted = await app.request(
      "/api/subjects/sub-1/atlas/deleted",
      { headers: authHeaders() },
      env,
    );
    const stillDeletedBody = (await stillDeleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(stillDeletedBody.entries).toHaveLength(1);
  });

  it("requires group when adding a learner entry", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);

    const missing = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Imaginary worm",
        }),
      },
      env,
    );
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as { message?: string };
    expect(missingBody.message).toMatch(/group required/i);

    const create = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Imaginary worm",
          fields: { group: "nematode" },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const added = (await create.json()) as AtlasEntryView;
    expect(added.fields.group).toBe("nematode");
    expect(added.originKey).toBeNull();
  });

  it("adds a learner entry and permanently deletes it from trash", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);

    const create = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Imaginary worm",
          fields: { group: "nematode" },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const added = (await create.json()) as AtlasEntryView;
    expect(added.canonicalName).toBe("Madeupius fictus");
    expect(added.originKey).toBeNull();

    const soft = await app.request(
      `/api/subjects/sub-1/atlas/entries/${added.id}/soft-delete`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const gone = await app.request(
      `/api/subjects/sub-1/atlas/entries/${added.id}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(gone.status).toBe(204);

    const deleted = await app.request(
      "/api/subjects/sub-1/atlas/deleted",
      { headers: authHeaders() },
      env,
    );
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(0);
  });

  it("stores a learner ref and concats it with dataset refs", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await createAtlas(env);
    const dataset = loadParasiteDataset();
    const base = dataset.entries.find((e) => e.key === "fasciola-hepatica")!;

    const res = await app.request(
      "/api/subjects/sub-1/atlas/entries/fasciola-hepatica/refs",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          citation: "Lecture notes week 3",
          note: "PPP table",
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const ref = (await res.json()) as {
      id: string;
      citation: string;
      note: string | null;
    };
    expect(ref.citation).toBe("Lecture notes week 3");
    expect(ref.note).toBe("PPP table");

    const list = await app.request(
      "/api/subjects/sub-1/atlas/entries",
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.originKey === "fasciola-hepatica");
    expect(view?.refs.slice(0, base.refs.length)).toEqual(base.refs);
    expect(view?.refs.some((r) => r.citation === "Lecture notes week 3")).toBe(
      true,
    );
  });
});
