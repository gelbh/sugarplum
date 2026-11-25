import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  createEntryPatchAtlas,
  createLearnerEntry,
  datasetEntry,
  entryPatchAuthHeaders,
  listEntries,
  patchEntry,
  rawRow,
  seedEntryPatchOwner,
  seedOverlayRow,
} from "../harness";
import { afterEach, describe, expect, it, vi } from "vitest";

const { refreshFocusBestEffort } = vi.hoisted(() => ({
  refreshFocusBestEffort: vi.fn(),
}));

vi.mock("../../../worker/atlas/focus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/atlas/focus")>();
  refreshFocusBestEffort.mockImplementation(actual.refreshFocusBestEffort);
  return {
    ...actual,
    refreshFocusBestEffort,
  };
});

import { app } from "../../../worker/index";
import type { AtlasEntryView } from "../../../src/atlas/types";
import arthropods from "../../../worker/atlas/datasets/parasites/arthropods.json";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("PATCH /entries/:entryId field overrides", () => {
  it("stores only the changed key on the first edit of a dataset entry", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual(["significance"]);
    expect(view.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
    const row = await rawRow(env, view.id);
    // fields_json keeps the full merged snapshot for a later dataset removal.
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({ significance: "Mine" });
  });

  it("removes an override when the value is set back to the dataset value", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine" },
    });
    const edited = (await first.json()) as AtlasEntryView;
    const back = await patchEntry(env, atlasId, edited.id, {
      fields: { significance: datasetEntry("fasciola-hepatica").fields.significance },
    });
    expect(back.status).toBe(200);
    expect(((await back.json()) as AtlasEntryView).editedFields).toEqual([]);
    expect((await rawRow(env, edited.id))?.field_overrides_json).toBe("{}");
  });

  it("resetFields removes one override and leaves the others", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine", family: "Editedidae" },
    });
    const edited = (await first.json()) as AtlasEntryView;
    const res = await patchEntry(env, atlasId, edited.id, {
      resetFields: ["family"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual(["significance"]);
    expect(view.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
  });

  it("rejects unknown reset keys and resets on learner entries", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const unknown = await patchEntry(env, atlasId, "fasciola-hepatica", {
      resetFields: ["nope"],
    });
    expect(unknown.status).toBe(400);
    const learner = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, learner.id, {
      resetFields: ["family"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a PATCH that both sets and resets the same field", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { family: "Editedidae", significance: "Mine" },
      resetFields: ["family"],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("family");
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first();
    expect(row).toBeNull();
  });

  it("writes nothing for a reset-only PATCH on an unedited dataset entry", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      resetFields: ["family"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.id).toBe("fasciola-hepatica");
    expect(view.editedAt).toBeNull();
  });

  it("converts a legacy full-copy row on its first PATCH", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });
    const res = await patchEntry(env, atlasId, "e-legacy", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    const row = await rawRow(env, "e-legacy");
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({
      significance: "Old copy",
      family: "Editedidae",
    });
  });

  it("nulls a copied dataset common name when a fields-only PATCH converts a legacy row", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });
    expect((await rawRow(env, "e-legacy"))?.common_name).toBe(dataset.commonName);
    const res = await patchEntry(env, atlasId, "e-legacy", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.commonNameEdited).toBe(false);
    expect(view.commonName).toBe(dataset.commonName);
    expect((await rawRow(env, "e-legacy"))?.common_name).toBeNull();
  });

  it("heals wiped fields before converting a legacy row on PATCH", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    expect(dataset.fields.distribution).not.toBeNull();
    expect(dataset.fields.lifecycleStages.length).toBeGreaterThan(0);
    await seedOverlayRow(env, atlasId, {
      id: "e-wiped",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({
        ...dataset.fields,
        significance: "Old copy",
        distribution: null,
        lifecycleStages: [],
      }),
    });
    const res = await patchEntry(env, atlasId, "e-wiped", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.fields.distribution).toBe(dataset.fields.distribution);
    expect(view.fields.lifecycleStages).toEqual(dataset.fields.lifecycleStages);
    expect(view.editedFields).toEqual(["family", "significance"]);
    expect(JSON.parse((await rawRow(env, "e-wiped"))!.field_overrides_json!)).toEqual({
      significance: "Old copy",
      family: "Editedidae",
    });
  });

  it("stores empty overrides on a delete-only tombstone", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const soft = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/soft-delete`,
      { method: "POST", headers: entryPatchAuthHeaders() },
      env,
    );
    expect(soft.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first<{
        fields_json: string;
        field_overrides_json: string | null;
        common_name: string | null;
      }>();
    expect(JSON.parse(row!.fields_json)).toEqual(
      datasetEntry("fasciola-hepatica").fields,
    );
    expect(row?.field_overrides_json).toBe("{}");
    expect(row?.common_name).toBeNull();
  });

  it("keeps a NULL common name on a ref-route overlay insert", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const ref = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/refs`,
      {
        method: "POST",
        headers: entryPatchAuthHeaders(true),
        body: JSON.stringify({
          citation: "Lecture 3 handout",
          url: "https://example.com/handout",
        }),
      },
      env,
    );
    expect(ref.status).toBeLessThan(300);
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first<{ common_name: string | null }>();
    expect(row?.common_name).toBeNull();
    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.commonName).toBe(datasetEntry("fasciola-hepatica").commonName);
    expect(view?.commonNameEdited).toBe(false);
  });

  it("stores NULL when the common name is set back to the dataset name", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const datasetName = datasetEntry("fasciola-hepatica").commonName;
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      commonName: "Sheep fluke",
    });
    const edited = (await first.json()) as AtlasEntryView;
    expect(edited.commonNameEdited).toBe(true);
    expect((await rawRow(env, edited.id))?.common_name).toBe("Sheep fluke");

    const back = await patchEntry(env, atlasId, edited.id, {
      commonName: datasetName,
    });
    const view = (await back.json()) as AtlasEntryView;
    expect(view.commonName).toBe(datasetName);
    expect(view.commonNameEdited).toBe(false);
    expect((await rawRow(env, edited.id))?.common_name).toBeNull();

    const fresh = await patchEntry(env, atlasId, "toxocara-canis", {
      commonName: datasetEntry("toxocara-canis").commonName,
    });
    const freshView = (await fresh.json()) as AtlasEntryView;
    expect((await rawRow(env, freshView.id))?.common_name).toBeNull();
  });

  it("Verify 7: a later dataset change shows through; the edited field stays and resets", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "psoroptes-ovis", {
      fields: { significance: "Student version" },
    });
    const edited = (await res.json()) as AtlasEntryView;

    // Simulate a dataset PR: loadParasiteDataset re-parses the imported JSON on every call.
    const json = (
      arthropods as { entries: { key: string; fields: { distribution: string | null } }[] }
    ).entries.find((e) => e.key === "psoroptes-ovis")!;
    const before = json.fields.distribution;
    json.fields.distribution = "Changed by a dataset PR";
    try {
      const view = (await listEntries(env, atlasId)).find(
        (e) => e.originKey === "psoroptes-ovis",
      )!;
      expect(view.fields.distribution).toBe("Changed by a dataset PR");
      expect(view.fields.significance).toBe("Student version");
      expect(view.editedFields).toEqual(["significance"]);

      const reset = await patchEntry(env, atlasId, edited.id, {
        resetFields: ["significance"],
      });
      const after = (await reset.json()) as AtlasEntryView;
      expect(after.fields.significance).toBe(
        datasetEntry("psoroptes-ovis").fields.significance,
      );
      expect(after.editedFields).toEqual([]);
    } finally {
      json.fields.distribution = before;
    }
  });

  it("keeps a retired dataset row an override row and updates its snapshot", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const snapshot = {
      ...datasetEntry("fasciola-hepatica").fields,
      significance: "Snapshot text",
    };
    await seedOverlayRow(env, atlasId, {
      id: "e-retired",
      originKey: "no-such-parasite",
      fieldsJson: JSON.stringify(snapshot),
      overridesJson: JSON.stringify({ significance: "Snapshot text" }),
    });
    const res = await patchEntry(env, atlasId, "e-retired", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.fields.significance).toBe("Snapshot text");
    expect(view.fields.family).toBe("Editedidae");
    // Nothing to reset to once the dataset entry is gone.
    expect(view.editedFields).toEqual([]);
    const row = await rawRow(env, "e-retired");
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({
      significance: "Snapshot text",
      family: "Editedidae",
    });
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
  });

  it("drops a stored diagnosticStage override that conflicts with a flagged dataset stage", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const giardia = datasetEntry("giardia-duodenalis");
    const flagged = giardia.fields.lifecycleStages.find((s) => s.diagnostic)!;
    expect(flagged.name).not.toBe("trophozoite");
    await seedOverlayRow(env, atlasId, {
      id: "e-diag",
      originKey: "giardia-duodenalis",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ diagnosticStage: "trophozoite" }),
    });
    const listed = (await listEntries(env, atlasId)).find((e) => e.id === "e-diag")!;
    expect(listed.fields.diagnosticStage).toBe(flagged.name);
    expect(listed.editedFields).toEqual([]);

    const res = await patchEntry(env, atlasId, "e-diag", { commonName: "Beaver fever" });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual([]);
    expect(view.fields.diagnosticStage).toBe(flagged.name);
    expect(JSON.parse((await rawRow(env, "e-diag"))!.field_overrides_json!)).toEqual({});
  });

  it("still rejects a submitted diagnosticStage that conflicts with the flagged stage", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "giardia-duodenalis", {
      fields: { diagnosticStage: "trophozoite" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 and keeps the other write when the row changed mid-request", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-race",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ significance: "First" }),
    });
    const concurrent = JSON.stringify({ significance: "Other tab snapshot" });
    const realPrepare = env.DB.prepare.bind(env.DB);
    let raced = false;
    env.DB.prepare = ((sql: string) => {
      if (raced || !/UPDATE atlas_entries\s+SET common_name/.test(sql)) {
        return realPrepare(sql);
      }
      raced = true;
      return {
        bind: (...args: unknown[]) => ({
          run: async () => {
            // Another tab's write lands between our read and our UPDATE.
            await realPrepare(
              "UPDATE atlas_entries SET fields_json = ?, updated_at = ? WHERE id = ? AND atlas_id = ?",
            ).bind(concurrent, "2026-03-01T00:00:00.000Z", "e-race", atlasId).run();
            env.DB.prepare = realPrepare;
            return realPrepare(sql).bind(...args).run();
          },
        }),
      } as unknown as D1PreparedStatement;
    }) as D1Database["prepare"];

    const res = await patchEntry(env, atlasId, "e-race", {
      fields: { family: "Editedidae" },
    });
    expect(raced).toBe(true);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("Entry changed, reload and try again");
    const row = await env.DB.prepare("SELECT * FROM atlas_entries WHERE id = ?")
      .bind("e-race")
      .first<{ updated_at: string; fields_json: string; field_overrides_json: string }>();
    expect(row?.updated_at).toBe("2026-03-01T00:00:00.000Z");
    expect(row?.fields_json).toBe(concurrent);
    expect(JSON.parse(row!.field_overrides_json)).toEqual({ significance: "First" });
  });

  it("refuses to overwrite an unparseable overrides column", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-corrupt",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: "{not json",
    });
    const res = await patchEntry(env, atlasId, "e-corrupt", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(500);
    const row = await rawRow(env, "e-corrupt");
    expect(row?.field_overrides_json).toBe("{not json");
    expect(row?.fields_json).toBe("{}");
  });
});

