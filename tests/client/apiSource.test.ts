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

    await expect(apiAtlasSource.list("sub-1")).resolves.toEqual(entries);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subjects/sub-1/atlas/entries",
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
    await expect(getAtlas("sub-1")).resolves.toBeNull();
  });

  it("getAtlas returns meta when present", async () => {
    const meta = {
      id: "atl-1",
      subjectId: "sub-1",
      templateKey: "parasite",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, meta)));
    await expect(getAtlas("sub-1")).resolves.toEqual(meta);
  });

  it("createAtlas POSTs to the atlas collection", async () => {
    const meta = {
      id: "atl-1",
      subjectId: "sub-1",
      templateKey: "parasite",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, meta));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAtlas("sub-1")).resolves.toEqual(meta);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subjects/sub-1/atlas",
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

    await createEntry("sub-1", { canonicalName: "New parasite" });
    await patchEntry("sub-1", "e1", { commonName: "Nick" });
    await softDeleteEntry("sub-1", "e1");
    await restoreEntry("sub-1", "e1");
    await resetEntry("sub-1", "e1");
    await purgeDeletedEntry("sub-1", "e1");
    await expect(listDeletedEntries("sub-1")).resolves.toEqual([]);

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "/api/subjects/sub-1/atlas/entries",
      "/api/subjects/sub-1/atlas/entries/e1",
      "/api/subjects/sub-1/atlas/entries/e1/soft-delete",
      "/api/subjects/sub-1/atlas/entries/e1/restore",
      "/api/subjects/sub-1/atlas/entries/e1/reset",
      "/api/subjects/sub-1/atlas/entries/e1",
      "/api/subjects/sub-1/atlas/deleted",
    ]);
  });

  it("surfaces API errors from list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })),
    );
    await expect(apiAtlasSource.list("sub-1")).rejects.toBeInstanceOf(ApiError);
  });
});
