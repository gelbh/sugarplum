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

describe("atlas learner entries", () => {
  it("requires group when adding a learner entry", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const missing = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Imaginary worm",
        }),
      },
      env,
    );
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as {
      message?: string;
      detail?: string;
    };
    expect(missingBody.detail ?? missingBody.message).toMatch(
      /group required/i,
    );

    const create = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
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
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const create = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
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
      `/api/atlas/${atlasId}/entries/${added.id}/soft-delete`,
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const gone = await app.request(
      `/api/atlas/${atlasId}/entries/${added.id}`,
      { method: "DELETE", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(gone.status).toBe(204);

    const deleted = await app.request(
      `/api/atlas/${atlasId}/deleted`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(0);
  });

});
