import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  createEntryPatchAtlas,
  createLearnerEntry,
  listEntries,
  patchEntry,
  seedEntryPatchOwner,
} from "../harness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import type { AtlasEntryView } from "../../../src/atlas/types";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const BUILT_IN_MESSAGE =
  "Scientific name of a built-in parasite cannot change; add an alias instead";

describe("PATCH /entries/:entryId canonicalName", () => {
  it("returns 400 for a dataset entry and writes no overlay", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola gigantica",
    });
    expect(res.status).toBe(400);
    const denied = (await res.json()) as { message?: string; detail?: string };
    expect(denied.detail ?? denied.message).toBe(BUILT_IN_MESSAGE);
    const view = (await listEntries(env, atlasId)).find(
      (e) => e.id === "fasciola-hepatica",
    );
    expect(view?.editedAt).toBeNull();
  });

  it("returns 400 for an edited dataset overlay row", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      commonName: "Edited fluke",
    });
    const edited = (await first.json()) as AtlasEntryView;
    const res = await patchEntry(env, atlasId, edited.id, {
      canonicalName: "Fasciola gigantica",
    });
    expect(res.status).toBe(400);
    const denied = (await res.json()) as { message?: string; detail?: string };
    expect(denied.detail ?? denied.message).toBe(BUILT_IN_MESSAGE);
  });

  it("renames a learner entry with normalization", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, added.id, {
      canonicalName: "  madeupius renamus ",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AtlasEntryView).canonicalName).toBe(
      "Madeupius renamus",
    );
    const listed = (await listEntries(env, atlasId)).find(
      (e) => e.id === added.id,
    );
    expect(listed?.canonicalName).toBe("Madeupius renamus");
  });

  it("returns 409 for a duplicate learner or dataset name, and accepts its own name", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    await createLearnerEntry(env, atlasId, "Madeupius renamus");
    const other = await createLearnerEntry(env, atlasId, "Madeupius alter");
    const dupLearner = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Madeupius renamus",
    });
    expect(dupLearner.status).toBe(409);
    const dupDataset = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Fasciola hepatica",
    });
    expect(dupDataset.status).toBe(409);
    const same = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Madeupius alter",
    });
    expect(same.status).toBe(200);
  });

  it("returns 400 for an empty or unparseable name", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, added.id, { canonicalName: "" });
    expect(res.status).toBe(400);
    const emptyBody = (await res.json()) as {
      message?: string;
      detail?: string;
    };
    expect(emptyBody.detail ?? emptyBody.message).toMatch(
      /canonicalName required/,
    );
    const notString = await patchEntry(env, atlasId, added.id, { canonicalName: 5 });
    expect(notString.status).toBe(400);
    const notStringBody = (await notString.json()) as {
      message?: string;
      detail?: string;
    };
    expect(notStringBody.detail ?? notStringBody.message).toMatch(
      /canonicalName must be a string/,
    );
  });

  it("accepts a built-in entry's own name alongside another edit", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola hepatica",
      commonName: "My fluke",
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.canonicalName).toBe("Fasciola hepatica");
    expect(view.commonName).toBe("My fluke");
  });
});

// workerd vitest does not apply vi.mock into the worker module graph.
describe.skip("PATCH /entries/:entryId Focus refresh", () => {
  const refresh = refreshFocusBestEffort;
  beforeEach(() => {
    refresh.mockClear();
  });

  it("does not refresh when the names stay the same", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    refresh.mockClear();
    const first = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    const edited = (await first.json()) as AtlasEntryView;
    expect(refresh).toHaveBeenCalledTimes(1);
    refresh.mockClear();

    const fieldsOnly = await patchEntry(env, atlasId, edited.id, {
      fields: { significance: "Mine" },
    });
    expect(fieldsOnly.status).toBe(200);
    const sameNames = await patchEntry(env, atlasId, edited.id, {
      aliases: ["follicular mite"],
      commonName: edited.commonName,
      canonicalName: edited.canonicalName,
    });
    expect(sameNames.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a common name change or a learner rename", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    refresh.mockClear();
    await patchEntry(env, atlasId, "fasciola-hepatica", { commonName: "My fluke" });
    expect(refresh).toHaveBeenCalledTimes(1);

    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    refresh.mockClear();
    await patchEntry(env, atlasId, added.id, { canonicalName: "Madeupius renamus" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("writes no overlay for a built-in entry's own name alone", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    refresh.mockClear();
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola hepatica",
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.id).toBe("fasciola-hepatica");
    expect(view.editedAt).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
