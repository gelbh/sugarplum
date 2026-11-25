import { env as cfEnv } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { app } from "../../../worker/index";
import type { AtlasEntryView } from "../../../src/atlas/types";
import {
  editAndSuggest,
  headers,
  listEntries,
  patchOnly,
  resetTestDb,
  studentSetup,
  suggest,
} from "./corrections-route-helpers";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

function psoroptes() {
  return loadParasiteDataset().entries.find((e) => e.key === "psoroptes-ovis")!;
}

describe("POST /api/atlas/:atlasId/entries/:entryId/suggestion", () => {
  it("stores this save's diff after the personal PATCH", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    const res = await editAndSuggest(
      env,
      atlasId,
      { fields: { significance: "Causes sheep scab." } },
      { note: "Shorter wording", sourceUrl: "https://example.org/scab" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "open",
      diff: { significance: { from: base.fields.significance, to: "Causes sheep scab." } },
    });

    const entries = await listEntries(env, atlasId);
    expect(entries.find((e) => e.originKey === "psoroptes-ovis")?.suggestionStatus).toBe("open");
    expect(entries.find((e) => e.originKey === "fasciola-hepatica")?.suggestionStatus).toBeNull();
  });

  it("returns 400 when nothing is stored that differs from the dataset", async () => {
    const { env, atlasId } = await studentSetup();
    const res = await suggest(env, atlasId, "psoroptes-ovis", {
      patch: { fields: { significance: "Never saved" } },
    });
    expect(res.status).toBe(400);
  });

  it("includes stored learner aliases when the save touched aliases", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    const res = await editAndSuggest(env, atlasId, { aliases: ["Scab mite"] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
  });

  it("accepts the unchanged scientific name and refuses a different one", async () => {
    const { env, atlasId } = await studentSetup();
    const same = await editAndSuggest(env, atlasId, {
      canonicalName: "Psoroptes ovis",
      fields: { significance: "New" },
    });
    expect(same.status).toBe(200);
    const renamed = await suggest(env, atlasId, "psoroptes-ovis", {
      patch: { canonicalName: "Psoroptes cuniculi", fields: { significance: "New" } },
    });
    expect(renamed.status).toBe(400);
    expect(await renamed.text()).toMatch(/add an alias instead/);
  });

  it("returns 400 for learner-added entries and 404 for unknown ones", async () => {
    const { env, atlasId } = await studentSetup();
    const created = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: headers("sess-a", true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Custom",
          fields: { group: "nematode" },
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as AtlasEntryView;
    const learner = await suggest(env, atlasId, id, { patch: { fields: { significance: "x" } } });
    expect(learner.status).toBe(400);
    const unknown = await suggest(env, atlasId, "no-such-key", {
      patch: { fields: { significance: "x" } },
    });
    expect(unknown.status).toBe(404);
  });

  it("sends an earlier suggested key at its current stored value", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "First" } });
    await patchOnly(env, atlasId, { fields: { significance: "Second" } });
    const res = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      significance: { from: base.fields.significance, to: "Second" },
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("merges two ticked saves into one open diff", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    const second = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await second.json()) as { diff: object }).diff).toEqual({
      significance: { from: base.fields.significance, to: "New" },
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("does not send an earlier edit saved without the box ticked", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await patchOnly(env, atlasId, { fields: { significance: "Private wording" } });
    const res = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("removes a key from the open diff once it is reset to the dataset", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    await editAndSuggest(env, atlasId, { fields: { majorOrgan: "skin of the back" } });
    const reset = await editAndSuggest(env, atlasId, {
      fields: { significance: base.fields.significance },
    });
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { diff: object }).diff).toEqual({
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });
});
