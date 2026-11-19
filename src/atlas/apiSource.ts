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

export function listAtlases() {
  return api<{ atlases: AtlasMeta[] }>(atlasCollectionPath()).then(
    (body) => body.atlases,
  );
}

export function ensureAtlas() {
  return api<AtlasMeta>(atlasCollectionPath(), { method: "POST" });
}

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

export type AtlasEntriesList = {
  entries: AtlasEntryView[];
  focusRefreshPending?: boolean;
};

export function listAtlasEntries(atlasId: string): Promise<AtlasEntriesList> {
  return api<AtlasEntriesList>(atlasPath(atlasId, "/entries"));
}

export const apiAtlasSource: AtlasSource = {
  async list(atlasId) {
    const body = await listAtlasEntries(atlasId);
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
    commonName: string;
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

export type AtlasMakeCardsResult = {
  deckId: string;
  jobId: string | null;
  jobs: Array<{ entryKey: string; materialId: string; jobId: string }>;
};

export function makeAtlasCards(
  atlasId: string,
  body: { deckId: string; entryKeys: string[] },
) {
  return api<AtlasMakeCardsResult>(atlasPath(atlasId, "/make-cards"), {
    method: "POST",
    json: body,
  });
}

export function patchEntryFocus(
  atlasId: string,
  entryId: string,
  override: "key" | "frequent" | "standard" | null,
) {
  return api<AtlasEntryView>(entryPath(atlasId, entryId, "/focus"), {
    method: "PATCH",
    json: { override },
  });
}
