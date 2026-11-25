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

describe("atlas entry overlay lifecycle", () => {
  it("persists an edit over a dataset entry", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const patch = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica`,
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
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
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.originKey === "fasciola-hepatica");
    expect(view?.commonName).toBe("Liver fluke (edited)");
    expect(view?.id).toBe(edited.id);
  });

  it("soft-deletes, restores pristine dataset id, and resets overlay edits", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const soft = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/soft-delete`,
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const hidden = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
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
      `/api/atlas/${atlasId}/deleted`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(1);
    expect(deletedBody.entries[0].originKey).toBe("fasciola-hepatica");

    const restore = await app.request(
      `/api/atlas/${atlasId}/entries/${deletedBody.entries[0].id}/restore`,
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(restore.status).toBe(204);

    const afterRestore = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
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
      `/api/atlas/${atlasId}/entries/fasciola-hepatica`,
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
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
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!;
    expect(edited.fields.lifecycleStages.length).toBeGreaterThan(0);
    expect(edited.fields.lifecycleStages).toEqual(
      dataset.fields.lifecycleStages,
    );
    expect(edited.fields.majorOrgan).toBe(dataset.fields.majorOrgan);
    expect(edited.fields.diagnosticTests).toEqual(
      dataset.fields.diagnosticTests,
    );

    const reset = await app.request(
      `/api/atlas/${atlasId}/entries/${edited.id}/reset`,
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(reset.status).toBe(204);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const view = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(view?.commonName).not.toBe("Temp edit");
    expect(view?.editedAt).toBeNull();
  });

  it("PATCHing lifecycleStages preserves sibling hosts", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!;

    const patch = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica`,
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          fields: {
            lifecycleStages: [
              {
                name: "egg",
                location: "faeces",
                diagnostic: true,
              },
            ],
            diagnosticStage: "egg",
          },
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const edited = (await patch.json()) as AtlasEntryView;
    expect(edited.fields.lifecycleStages).toHaveLength(1);
    expect(edited.fields.definitiveHosts).toEqual(
      dataset.fields.definitiveHosts,
    );
    expect(edited.fields.majorOrgan).toBe(dataset.fields.majorOrgan);
  });

  it("refuses permanent delete of a soft-deleted dataset overlay", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const soft = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/soft-delete`,
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(soft.status).toBe(204);

    const deleted = await app.request(
      `/api/atlas/${atlasId}/deleted`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const deletedBody = (await deleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(deletedBody.entries).toHaveLength(1);
    const tombstoneId = deletedBody.entries[0].id;

    const purge = await app.request(
      `/api/atlas/${atlasId}/entries/${tombstoneId}`,
      { method: "DELETE", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(purge.status).toBe(400);
    const purgeBody = (await purge.json()) as {
      message?: string;
      detail?: string;
    };
    expect(purgeBody.detail ?? purgeBody.message).toMatch(
      /cannot be permanently deleted/i,
    );

    const stillHidden = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
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
      `/api/atlas/${atlasId}/deleted`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const stillDeletedBody = (await stillDeleted.json()) as {
      entries: AtlasEntryView[];
    };
    expect(stillDeletedBody.entries).toHaveLength(1);
  });

});
