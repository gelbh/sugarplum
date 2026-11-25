import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  createEntryPatchAtlas,
  datasetEntry,
  entryPatchAuthHeaders,
  listEntries,
  patchEntry,
  seedEntryPatchOwner,
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
import { searchable } from "../../../src/atlas/hub/nameMatch";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const demodex = datasetEntry("demodex-canis");
const datasetAliases = [...demodex.aliases, ...demodex.misspellings];

describe("PATCH /entries/:entryId aliases", () => {
  it("saves trimmed learner aliases and unions them with dataset aliases", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);

    const res = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["  follicular mite ", "", "Follicle Mite", "follicular  mite"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.learnerAliases).toEqual(["follicular mite", "Follicle Mite"]);
    expect(view.aliases).toEqual(expect.arrayContaining(datasetAliases));
    expect(view.aliases.at(-1)).toBe("follicular mite");
    expect(
      view.aliases.filter((a) => searchable(a) === "follicle mite"),
    ).toHaveLength(1);
    expect(view.editedFields).toEqual([]);

    const listed = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(listed?.learnerAliases).toEqual(["follicular mite", "Follicle Mite"]);
  });

  it("replaces aliases on an existing overlay row and clears them with []", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const first = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    const edited = (await first.json()) as AtlasEntryView;

    const cleared = await patchEntry(env, atlasId, edited.id, { aliases: [] });
    expect(cleared.status).toBe(200);
    const view = (await cleared.json()) as AtlasEntryView;
    expect(view.learnerAliases).toEqual([]);
    expect(view.aliases).not.toContain("follicular mite");
  });

  it("rejects more than 20 aliases, long aliases and non-lists", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);

    const tooMany = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: Array.from({ length: 21 }, (_, i) => `alias ${i}`),
    });
    expect(tooMany.status).toBe(400);
    const tooManyBody = (await tooMany.json()) as {
      message?: string;
      detail?: string;
    };
    expect(tooManyBody.detail ?? tooManyBody.message).toMatch(
      /At most 20 aliases/,
    );
    const tooLong = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["a".repeat(81)],
    });
    expect(tooLong.status).toBe(400);
    const tooLongBody = (await tooLong.json()) as {
      message?: string;
      detail?: string;
    };
    expect(tooLongBody.detail ?? tooLongBody.message).toMatch(/80 characters/);
    const notList = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: "follicular mite",
    });
    expect(notList.status).toBe(400);
    const twenty = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: Array.from({ length: 20 }, (_, i) => `alias ${i}`),
    });
    expect(twenty.status).toBe(200);
  });

  it("reset to dataset clears learner aliases and overrides", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      aliases: ["big liver fluke"],
      fields: { significance: "Mine" },
    });
    const edited = (await res.json()) as AtlasEntryView;

    const reset = await app.request(
      `/api/atlas/${atlasId}/entries/${edited.id}/reset`,
      { method: "POST", headers: entryPatchAuthHeaders() },
      env,
    );
    expect(reset.status).toBe(204);

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.id === "fasciola-hepatica",
    );
    expect(view?.editedAt).toBeNull();
    expect(view?.aliases).not.toContain("big liver fluke");
    expect(view?.learnerAliases).toEqual([]);
    expect(view?.editedFields).toEqual([]);
  });

  it("refreshes Focus so a learner alias counts as a mention", async () => {
    const env = cfEnv;
    await seedEntryPatchOwner(env);
    const atlasId = await createEntryPatchAtlas(env);
    const paste = await app.request(
      `/api/atlas/${atlasId}/materials/paste`,
      {
        method: "POST",
        headers: entryPatchAuthHeaders(true),
        body: JSON.stringify({
          text: "Follicular mite notes",
          filename: "Follicular_mite_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    const before = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(before?.tier).not.toBe("key");

    const res = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    expect(res.status).toBe(200);

    const after = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(after?.tier).toBe("key");
  });
});
