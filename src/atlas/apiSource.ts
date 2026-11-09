import { api, ApiError } from "../api/client";
import type { AtlasEntryView, AtlasSource, DatasetFields } from "./types";

export type AtlasMeta = {
  id: string;
  subjectId: string;
  templateKey: string;
  createdAt: string;
};

function atlasPath(subjectId: string, suffix = ""): string {
  return `/api/subjects/${encodeURIComponent(subjectId)}/atlas${suffix}`;
}

function entryPath(subjectId: string, entryId: string, suffix = ""): string {
  return atlasPath(
    subjectId,
    `/entries/${encodeURIComponent(entryId)}${suffix}`,
  );
}

/** GET atlas meta; `null` when the subject has no Atlas yet (404). */
export async function getAtlas(subjectId: string): Promise<AtlasMeta | null> {
  try {
    return await api<AtlasMeta>(atlasPath(subjectId));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function createAtlas(subjectId: string) {
  return api<AtlasMeta>(atlasPath(subjectId), { method: "POST" });
}

export const apiAtlasSource: AtlasSource = {
  async list(subjectId) {
    const body = await api<{ entries: AtlasEntryView[] }>(
      atlasPath(subjectId, "/entries"),
    );
    return body.entries;
  },
};

export function listDeletedEntries(subjectId: string) {
  return api<{ entries: AtlasEntryView[] }>(
    atlasPath(subjectId, "/deleted"),
  ).then((body) => body.entries);
}

export function createEntry(
  subjectId: string,
  body: {
    canonicalName: string;
    commonName?: string | null;
    fields?: Partial<DatasetFields>;
  },
) {
  return api<AtlasEntryView>(atlasPath(subjectId, "/entries"), {
    method: "POST",
    json: body,
  });
}

export function patchEntry(
  subjectId: string,
  entryId: string,
  body: {
    commonName?: string | null;
    fields?: Partial<DatasetFields>;
  },
) {
  return api<AtlasEntryView>(entryPath(subjectId, entryId), {
    method: "PATCH",
    json: body,
  });
}

export function softDeleteEntry(subjectId: string, entryId: string) {
  return api<void>(entryPath(subjectId, entryId, "/soft-delete"), {
    method: "POST",
  });
}

export function restoreEntry(subjectId: string, entryId: string) {
  return api<void>(entryPath(subjectId, entryId, "/restore"), {
    method: "POST",
  });
}

export function resetEntry(subjectId: string, entryId: string) {
  return api<void>(entryPath(subjectId, entryId, "/reset"), {
    method: "POST",
  });
}

export function purgeDeletedEntry(subjectId: string, entryId: string) {
  return api<void>(entryPath(subjectId, entryId), { method: "DELETE" });
}
