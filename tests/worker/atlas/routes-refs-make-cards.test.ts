import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb, seedSession, seedUser, seedAtlasMaterial } from "../harness";
import {
  atlasRouteAuthHeaders,
  createAtlasForRoutes,
  seedAtlasRouteOwner,
  seedDeck,
} from "../harness/atlas-routes";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
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
    const env = cfEnv;
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
      "SELECT material_id, topic_hints_json, atlas_provenance_json FROM generation_jobs WHERE id = ?",
    )
      .bind(body.jobId)
      .first<{
        material_id: string;
        topic_hints_json: string | null;
        atlas_provenance_json: string | null;
      }>();
    expect(job?.material_id).toBe(body.jobs[0]?.materialId);
    expect(job?.topic_hints_json).toContain("Toxocara");
    const provenance = JSON.parse(job?.atlas_provenance_json ?? "null") as {
      atlasEntryId: string;
      citations: string[];
    };
    expect(provenance.atlasEntryId).toBe("toxocara-canis");
    expect(Array.isArray(provenance.citations)).toBe(true);
  });
});
