import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import {
  apiAtlasSource,
  createAtlas,
  createEntry,
  getAtlas,
  listDeletedEntries,
  patchEntry,
  purgeDeletedEntry,
  resetEntry,
  restoreEntry,
  softDeleteEntry,
} from "../../src/atlas/apiSource";

function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiAtlasSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists merged entries via GET /entries", async () => {
    const entries = [
      {
        id: "fasciola-hepatica",
        originKey: "fasciola-hepatica",
        canonicalName: "Fasciola hepatica",
        commonName: "Liver fluke",
        aliases: [],
        fields: {},
        refs: [],
        images: [],
        editedAt: null,
        tier: null,
        reason: null,
        focusMaterialIds: [],
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { entries }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiAtlasSource.list("atl-1")).resolves.toEqual(entries);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/atlas/atl-1/entries",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("getAtlas returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(404, { message: "Atlas not found" }),
      ),
    );
    await expect(getAtlas("atl-1")).resolves.toBeNull();
  });

  it("getAtlas returns meta when present", async () => {
    const meta = {
      id: "atl-1",
      userId: "user-a",
      templateKey: "parasite",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, meta)));
    await expect(getAtlas("atl-1")).resolves.toEqual(meta);
  });

  it("createAtlas POSTs to the atlas collection", async () => {
    const meta = {
      id: "atl-1",
      userId: "user-a",
      templateKey: "parasite",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, meta));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAtlas()).resolves.toEqual(meta);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/atlas",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("mutate helpers hit the overlay routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(201, {
          id: "e1",
          originKey: null,
          canonicalName: "New parasite",
          commonName: null,
          aliases: [],
          fields: {},
          refs: [],
          images: [],
          editedAt: "2026-01-01T00:00:00.000Z",
          tier: null,
          reason: null,
          focusMaterialIds: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "e1",
          originKey: null,
          canonicalName: "New parasite",
          commonName: "Nick",
          aliases: [],
          fields: {},
          refs: [],
          images: [],
          editedAt: "2026-01-01T00:00:00.000Z",
          tier: null,
          reason: null,
          focusMaterialIds: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(200, { entries: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await createEntry("atl-1", {
      canonicalName: "New parasite",
      commonName: "Made-up worm",
    });
    await patchEntry("atl-1", "e1", { commonName: "Nick" });
    await softDeleteEntry("atl-1", "e1");
    await restoreEntry("atl-1", "e1");
    await resetEntry("atl-1", "e1");
    await purgeDeletedEntry("atl-1", "e1");
    await expect(listDeletedEntries("atl-1")).resolves.toEqual([]);

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "/api/atlas/atl-1/entries",
      "/api/atlas/atl-1/entries/e1",
      "/api/atlas/atl-1/entries/e1/soft-delete",
      "/api/atlas/atl-1/entries/e1/restore",
      "/api/atlas/atl-1/entries/e1/reset",
      "/api/atlas/atl-1/entries/e1",
      "/api/atlas/atl-1/deleted",
    ]);
  });

  it("surfaces API errors from list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })),
    );
    await expect(apiAtlasSource.list("atl-1")).rejects.toBeInstanceOf(ApiError);
  });
});
