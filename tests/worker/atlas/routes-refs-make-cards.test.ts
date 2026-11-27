import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  getMaterials,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
} from "../harness";
import {
  atlasRouteAuthHeaders,
  createAtlasForRoutes,
  seedAtlasRouteOwner,
  seedDeck,
} from "../harness/atlas-routes";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../../src/atlas/types";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("atlas refs and make-cards", () => {
  it("stores a learner ref and concats it with dataset refs", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);
    const dataset = loadParasiteDataset();
    const base = dataset.entries.find((e) => e.key === "fasciola-hepatica")!;

    const res = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/refs`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
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
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.originKey === "fasciola-hepatica");
    expect(view?.refs.slice(0, base.refs.length)).toEqual(base.refs);
    expect(view?.refs.some((r) => r.citation === "Lecture notes week 3")).toBe(
      true,
    );
  });

  it("enqueues Make cards jobs with atlas provenance for an entry", async () => {
    const env = installQueueRecorders(cfEnv, { forward: false });
    await seedAtlasRouteOwner(env);
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const { id: atlasId } = await createAtlasForRoutes(env);

    const res = await app.request(
      `/api/atlas/${atlasId}/make-cards`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          deckId: "deck-1",
          entryKeys: ["toxocara-canis"],
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      deckId: string;
      jobId: string;
      jobs: Array<{ entryKey: string; materialId: string; jobId: string }>;
    };
    expect(body.deckId).toBe("deck-1");
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.entryKey).toBe("toxocara-canis");
    expect(body.jobId).toBe(body.jobs[0]?.jobId);

    const job = await env.DB.prepare(
      "SELECT material_id, status, topic_hints_json, atlas_provenance_json FROM generation_jobs WHERE id = ?",
    )
      .bind(body.jobId)
      .first<{
        material_id: string;
        status: string;
        topic_hints_json: string | null;
        atlas_provenance_json: string | null;
      }>();
    expect(job?.material_id).toBe(body.jobs[0]?.materialId);
    expect(job?.status).toBe("queued");
    expect(job?.topic_hints_json).toContain("Toxocara");
    const provenance = JSON.parse(job?.atlas_provenance_json ?? "null") as {
      atlasEntryId: string;
      citations: string[];
      hasExtras?: boolean;
      atlasId?: string;
    };
    expect(provenance.atlasEntryId).toBe("toxocara-canis");
    expect(Array.isArray(provenance.citations)).toBe(true);
    expect(provenance.hasExtras).toBe(true);
    expect(provenance.atlasId).toBe(atlasId);
    expect(getQueueMessages().length).toBeGreaterThan(0);

    const cards = await getCards(env);
    const organ = cards.find((c) => {
      const front = JSON.parse(c.front_json) as string;
      return front.includes("Toxocara canis") && /major organ/i.test(front);
    });
    expect(organ).toBeDefined();

    const material = (await getMaterials(env)).find(
      (m) => m.id === body.jobs[0]?.materialId,
    );
    expect(material?.r2_key).toBeTruthy();
    const r2Text = await env.MATERIALS.get(material!.r2_key!);
    const bodyText = (await r2Text!.text()) as string;
    expect(bodyText).not.toContain("Major organ:");
    expect(bodyText).toContain("Parasite: Toxocara canis");
  });

  it("precraft-only: extras empty ⇒ needs_review and generate queue not called", async () => {
    const env = installQueueRecorders(cfEnv, { forward: false });
    await seedAtlasRouteOwner(env);
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const { id: atlasId } = await createAtlasForRoutes(env);

    const create = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          canonicalName: "Stubus onlyus",
          commonName: "Stub worm",
          fields: {
            group: "nematode",
            majorOrgan: "ileum",
          },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const added = (await create.json()) as AtlasEntryView;

    const res = await app.request(
      `/api/atlas/${atlasId}/make-cards`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          deckId: "deck-1",
          entryKeys: [added.id],
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      jobId: string;
      jobs: Array<{ materialId: string; jobId: string }>;
    };

    const job = (await getGenerationJobs(env)).find((j) => j.id === body.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.finished_at).toBeTruthy();
    const provenance = JSON.parse(job?.atlas_provenance_json ?? "null") as {
      hasExtras?: boolean;
    };
    expect(provenance.hasExtras).toBe(false);
    expect(getQueueMessages()).toHaveLength(0);

    const cards = await getCards(env);
    expect(
      cards.some((c) => {
        const front = JSON.parse(c.front_json) as string;
        return front.includes("Stubus onlyus") && /major organ/i.test(front);
      }),
    ).toBe(true);

    const material = (await getMaterials(env)).find(
      (m) => m.id === body.jobs[0]?.materialId,
    );
    const r2Text = await env.MATERIALS.get(material!.r2_key!);
    expect(await r2Text!.text()).toBe("Parasite: Stubus onlyus\n");
  });

  it("rolls back job + material + R2 when precraft seed fails", async () => {
    const base = installQueueRecorders(cfEnv, { forward: false });
    await seedAtlasRouteOwner(base);
    await seedDeck(base, {
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const { id: atlasId } = await createAtlasForRoutes(base);

    const env = {
      ...base,
      DB: new Proxy(base.DB, {
        get(target, prop, receiver) {
          if (prop !== "prepare") {
            const value = Reflect.get(target, prop, receiver);
            return typeof value === "function"
              ? (value as (...args: unknown[]) => unknown).bind(target)
              : value;
          }
          return (sql: string) => {
            if (/INSERT INTO cards\b/i.test(sql)) {
              return {
                bind: () => ({
                  run: async () => {
                    throw new Error("forced seed failure");
                  },
                }),
              } as unknown as D1PreparedStatement;
            }
            return target.prepare(sql);
          };
        },
      }),
    };

    const beforeMaterials = await getMaterials(env);
    const beforeJobs = await getGenerationJobs(env);

    const res = await app.request(
      `/api/atlas/${atlasId}/make-cards`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          deckId: "deck-1",
          entryKeys: ["toxocara-canis"],
        }),
      },
      env,
    );
    expect(res.status).toBeGreaterThanOrEqual(500);

    expect(await getGenerationJobs(env)).toHaveLength(beforeJobs.length);
    expect(await getMaterials(env)).toHaveLength(beforeMaterials.length);
    expect(await getCards(env)).toHaveLength(0);
    expect(getQueueMessages()).toHaveLength(0);
  });
});
