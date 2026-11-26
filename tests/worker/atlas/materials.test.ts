import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getAtlasMaterials,
  getGenerationJobs,
  getMaterials,
  resetTestDb,
  seedDeck,
  seedR2,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import type { AtlasEntryView } from "../../../src/atlas/types";


afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function minimalPptx(slideXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
  );
  zip.file("ppt/slides/slide1.xml", slideXml);
  return zip.generateAsync({ type: "arraybuffer" });
}

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

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function createAtlas(env: Bindings) {
  const created = await app.request(
    "/api/atlas",
    { method: "POST", headers: authHeaders() },
    env,
  );
  expect(created.status).toBe(201);
  return (await created.json()) as { id: string };
}

describe("atlas course pack materials API", () => {
  it("paste creates ready row, refreshes Focus, never enqueues a job", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const atlas = await createAtlas(env);

    const paste = await app.request(
      `/api/atlas/${atlas.id}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Fasciola hepatica is Key for this tutorial.",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
          source_role: "tutorial",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);
    const material = (await paste.json()) as {
      id: string;
      status: string;
      kind: string;
      jobId?: string | null;
    };
    expect(material).toMatchObject({
      status: "ready",
      kind: "paste",
    });
    expect(material.jobId).toBeUndefined();
    expect((await getGenerationJobs(env))).toHaveLength(0);

    const list = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("complete pptx extracts slide text into Focus (not filename-only)", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const atlas = await createAtlas(env);

    const upload = await app.request(
      `/api/atlas/${atlas.id}/materials/upload-url`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          filename: "Week2_tutorial.pptx",
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          size: 64,
          source_role: "tutorial",
        }),
      },
      env,
    );
    expect(upload.status).toBe(200);
    const { materialId, r2Key } = (await upload.json()) as {
      materialId: string;
      r2Key: string;
    };
    const pptxBytes = await minimalPptx(
      `<p:sld><p:cSld><p:spTree><a:t>Fasciola hepatica</a:t><a:t>tutorial intro</a:t></p:spTree></p:cSld></p:sld>`,
    );
    await env.MATERIALS.put(r2Key, pptxBytes);

    const complete = await app.request(
      `/api/atlas/materials/${materialId}/complete`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      id: materialId,
      status: "ready",
      kind: "pptx",
      page_count: 1,
      jobId: null,
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);

    const list = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("complete pdf returns jobId null and leaves generation_jobs empty", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const atlas = await createAtlas(env);

    const upload = await app.request(
      `/api/atlas/${atlas.id}/materials/upload-url`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
          contentType: "application/pdf",
          size: 12,
          source_role: "tutorial",
        }),
      },
      env,
    );
    expect(upload.status).toBe(200);
    const { materialId, r2Key } = (await upload.json()) as {
      materialId: string;
      r2Key: string;
    };
    await seedR2(env, r2Key, "%PDF-fake");

    const complete = await app.request(
      `/api/atlas/materials/${materialId}/complete`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          ocrPages: [{ page: 1, text: "Fasciola hepatica tutorial intro" }],
        }),
      },
      env,
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      id: materialId,
      status: "ready",
      jobId: null,
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);

    const list = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
    });
  });

  it("complete PDF without ocrPages Keys when extract finds page text", async () => {
    const extractMod = await import("../../../worker/materials/extract-pdf");
    const spy = vi
      .spyOn(extractMod, "extractPdfPages")
      .mockResolvedValue({
        pages: [{ page: 1, text: "Fasciola hepatica tutorial intro" }],
        totalPages: 1,
        pageStart: 1,
        pageEnd: 1,
      });
    try {
      const env = cfEnv;
      await seedOwner(env);
      const atlas = await createAtlas(env);

      const upload = await app.request(
        `/api/atlas/${atlas.id}/materials/upload-url`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            filename: "AB2_tutorial_01.pdf",
            contentType: "application/pdf",
            size: 12,
            source_role: "tutorial",
          }),
        },
        env,
      );
      expect(upload.status).toBe(200);
      const { materialId, r2Key } = (await upload.json()) as {
        materialId: string;
        r2Key: string;
      };
      await seedR2(env, r2Key, "%PDF-fake");

      const complete = await app.request(
        `/api/atlas/materials/${materialId}/complete`,
        { method: "POST", headers: authHeaders() },
        env,
      );
      expect(complete.status).toBe(200);
      expect(await complete.json()).toMatchObject({
        id: materialId,
        status: "ready",
        jobId: null,
      });
      expect((await getGenerationJobs(env))).toHaveLength(0);
      expect(spy).toHaveBeenCalled();

      const list = await app.request(
        `/api/atlas/${atlas.id}/entries`,
        { headers: authHeaders() },
        env,
      );
      const body = (await list.json()) as { entries: AtlasEntryView[] };
      expect(
        body.entries.find((e) => e.id === "fasciola-hepatica"),
      ).toMatchObject({
        tier: "key",
        reason: expect.stringMatching(/tutorial/i),
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("delete pack material drops Focus contribution on refresh", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const atlas = await createAtlas(env);

    const paste = await app.request(
      `/api/atlas/${atlas.id}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Fasciola hepatica",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
          source_role: "tutorial",
        }),
      },
      env,
    );
    const material = (await paste.json()) as { id: string };

    const before = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    const beforeBody = (await before.json()) as { entries: AtlasEntryView[] };
    expect(
      beforeBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("key");

    const del = await app.request(
      `/api/atlas/materials/${material.id}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      },
      env,
    );
    expect(del.status).toBe(204);

    const after = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    const afterBody = (await after.json()) as { entries: AtlasEntryView[] };
    expect(
      afterBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBeNull();
  });

  it("promote copies pack file into deck materials without enqueueing a job", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Cards",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const atlas = await createAtlas(env);

    const paste = await app.request(
      `/api/atlas/${atlas.id}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Fasciola hepatica notes for later cards",
          filename: "notes.txt",
          source_role: "notes",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);
    const packMaterial = (await paste.json()) as {
      id: string;
      r2_key: string;
    };

    const jobsBefore = (await getGenerationJobs(env)).length;
    const promote = await app.request(
      `/api/atlas/materials/${packMaterial.id}/promote`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ deckId: "deck-a" }),
      },
      env,
    );
    expect(promote.status).toBe(201);
    const deckMaterial = (await promote.json()) as {
      id: string;
      deck_id: string;
      kind: string;
      status: string;
      r2_key: string;
      jobId: string | null;
    };
    expect(deckMaterial).toMatchObject({
      deck_id: "deck-a",
      kind: "paste",
      status: "ready",
      jobId: null,
    });
    expect(deckMaterial.id).not.toBe(packMaterial.id);
    expect(deckMaterial.r2_key).not.toBe(packMaterial.r2_key);
    expect((await getGenerationJobs(env))).toHaveLength(jobsBefore);
    expect((await getMaterials(env)).some((m) => m.id === deckMaterial.id)).toBe(true);
    expect((await getAtlasMaterials(env)).some((m) => m.id === packMaterial.id)).toBe(
      true,
    );
    expect(await env.MATERIALS.get(deckMaterial.r2_key)).not.toBeNull();
  });

  it("lists and patches source_role", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const atlas = await createAtlas(env);

    const paste = await app.request(
      `/api/atlas/${atlas.id}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "notes",
          filename: "notes.txt",
          source_role: "notes",
        }),
      },
      env,
    );
    const material = (await paste.json()) as { id: string };

    const listed = await app.request(
      `/api/atlas/${atlas.id}/materials`,
      { headers: authHeaders() },
      env,
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      materials: Array<{ id: string; source_role: string }>;
    };
    expect(listBody.materials).toHaveLength(1);
    expect(listBody.materials[0]!.source_role).toBe("notes");

    const patched = await app.request(
      `/api/atlas/materials/${material.id}`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ source_role: "practical" }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      id: material.id,
      source_role: "practical",
    });
  });
});
