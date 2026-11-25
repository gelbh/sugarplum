import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  createEntryPatchAtlas,
  datasetEntry,
  listEntries,
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


afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("stored field overrides on read", () => {
  it("lists override rows as dataset fields plus overrides", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-over",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ significance: "Mine" }),
    });

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.fields.significance).toBe("Mine");
    expect(view?.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
    expect(view?.editedFields).toEqual(["significance"]);
  });

  it("reads a legacy full-copy row exactly as before", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.fields).toEqual({ ...dataset.fields, significance: "Old copy" });
    expect(view?.editedFields).toEqual(["significance"]);
  });
});
