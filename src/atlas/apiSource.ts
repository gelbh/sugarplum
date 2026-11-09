import { api, ApiError } from "../api/client";
import type { AtlasEntryView, AtlasSource, DatasetFields } from "./types";

export type AtlasMeta = {
  id: string;
  userId: string;
  templateKey: string;
  createdAt: string;
};

function atlasCollectionPath(suffix = ""): string {
  return `/api/atlas${suffix}`;
}

function atlasPath(atlasId: string, suffix = ""): string {
  return `/api/atlas/${encodeURIComponent(atlasId)}${suffix}`;
}

function entryPath(atlasId: string, entryId: string, suffix = ""): string {
  return atlasPath(
    atlasId,
    `/entries/${encodeURIComponent(entryId)}${suffix}`,
  );
}

/** List atlases for the signed-in user. */
export function listAtlases() {
  return api<{ atlases: AtlasMeta[] }>(atlasCollectionPath()).then(
    (body) => body.atlases,
  );
}

/** Ensure the Parasitology Atlas exists (create or return existing). */
export function ensureAtlas() {
  return api<AtlasMeta>(atlasCollectionPath(), { method: "POST" });
}

/** GET atlas meta; `null` when not found (404). */
export async function getAtlas(atlasId: string): Promise<AtlasMeta | null> {
  try {
    return await api<AtlasMeta>(atlasPath(atlasId));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** @deprecated Prefer ensureAtlas(); kept as alias for create. */
export function createAtlas() {
  return ensureAtlas();
}

export const apiAtlasSource: AtlasSource = {
  async list(atlasId) {
    const body = await api<{ entries: AtlasEntryView[] }>(
      atlasPath(atlasId, "/entries"),
    );
    return body.entries;
  },
};

export function listDeletedEntries(atlasId: string) {
  return api<{ entries: AtlasEntryView[] }>(
    atlasPath(atlasId, "/deleted"),
  ).then((body) => body.entries);
}

export function createEntry(
  atlasId: string,
  body: {
    canonicalName: string;
    commonName?: string | null;
    fields?: Partial<DatasetFields>;
  },
) {
  return api<AtlasEntryView>(atlasPath(atlasId, "/entries"), {
    method: "POST",
    json: body,
  });
}

export function patchEntry(
  atlasId: string,
  entryId: string,
  body: {
    commonName?: string | null;
    fields?: Partial<DatasetFields>;
  },
) {
  return api<AtlasEntryView>(entryPath(atlasId, entryId), {
    method: "PATCH",
    json: body,
  });
}

export function softDeleteEntry(atlasId: string, entryId: string) {
  return api<void>(entryPath(atlasId, entryId, "/soft-delete"), {
    method: "POST",
  });
}

export function restoreEntry(atlasId: string, entryId: string) {
  return api<void>(entryPath(atlasId, entryId, "/restore"), {
    method: "POST",
  });
}

export function resetEntry(atlasId: string, entryId: string) {
  return api<void>(entryPath(atlasId, entryId, "/reset"), {
    method: "POST",
  });
}

export function purgeDeletedEntry(atlasId: string, entryId: string) {
  return api<void>(entryPath(atlasId, entryId), { method: "DELETE" });
}
