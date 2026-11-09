export type AtlasRow = {
  id: string;
  subject_id: string;
  template_key: string;
  created_at: string;
};

export type AtlasEntryRow = {
  id: string;
  atlas_id: string;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  status: string;
  created_at: string;
  updated_at: string;
  origin_key: string | null;
  origin_version: number | null;
  edited_at: string | null;
  deleted_at: string | null;
};

export type AtlasRefRow = {
  id: string;
  entry_id: string;
  field_key: string | null;
  citation: string;
  url: string | null;
  material_id: string | null;
  page: number | null;
  note: string | null;
  user_added: number;
  created_at: string;
};

export type AtlasImageRow = {
  id: string;
  entry_id: string;
  src: string;
  role: string | null;
  caption: string | null;
  credit: string | null;
  license: string | null;
  source_url: string | null;
  is_hero: number;
  user_added: number;
  deleted_at: string | null;
  created_at: string;
};

export type AtlasTestState = {
  atlases: Map<string, AtlasRow>;
  entries: Map<string, AtlasEntryRow>;
  refs: Map<string, AtlasRefRow>;
  images: Map<string, AtlasImageRow>;
};

export function initAtlasState(): AtlasTestState {
  return {
    atlases: new Map(),
    entries: new Map(),
    refs: new Map(),
    images: new Map(),
  };
}

function entriesForAtlas(state: AtlasTestState, atlasId: string) {
  return [...state.entries.values()].filter((e) => e.atlas_id === atlasId);
}

export function atlasFirst<T>(
  state: AtlasTestState,
  normalized: string,
  bound: unknown[],
): T | null {
  if (
    normalized.startsWith(
      "SELECT id, subject_id, template_key, created_at FROM atlases WHERE subject_id =",
    )
  ) {
    const subjectId = bound[0] as string;
    for (const row of state.atlases.values()) {
      if (row.subject_id === subjectId) return row as T;
    }
    return null;
  }

  if (
    normalized.includes("FROM atlas_entries WHERE atlas_id =") &&
    normalized.includes("AND id =")
  ) {
    const [atlasId, id] = bound as [string, string];
    const row = state.entries.get(id);
    if (!row || row.atlas_id !== atlasId) return null;
    return row as T;
  }

  if (
    normalized.includes("FROM atlas_entries WHERE atlas_id =") &&
    normalized.includes("AND origin_key =")
  ) {
    const [atlasId, originKey] = bound as [string, string];
    for (const row of state.entries.values()) {
      if (row.atlas_id === atlasId && row.origin_key === originKey) {
        return row as T;
      }
    }
    return null;
  }

  return null;
}

export function atlasAll<T>(
  state: AtlasTestState,
  normalized: string,
  bound: unknown[],
): { results: T[] } | null {
  if (
    normalized.includes("FROM atlas_entries WHERE atlas_id =") &&
    !normalized.includes("AND id =") &&
    !normalized.includes("AND origin_key =")
  ) {
    const atlasId = bound[0] as string;
    return { results: entriesForAtlas(state, atlasId) as T[] };
  }

  if (
    normalized.includes("FROM atlas_entry_refs r") &&
    normalized.includes("WHERE e.atlas_id =")
  ) {
    const atlasId = bound[0] as string;
    const entryIds = new Set(
      entriesForAtlas(state, atlasId).map((e) => e.id),
    );
    const rows = [...state.refs.values()].filter((r) =>
      entryIds.has(r.entry_id),
    );
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_entry_images i") &&
    normalized.includes("WHERE e.atlas_id =")
  ) {
    const atlasId = bound[0] as string;
    const entryIds = new Set(
      entriesForAtlas(state, atlasId).map((e) => e.id),
    );
    const rows = [...state.images.values()].filter(
      (r) => entryIds.has(r.entry_id) && r.deleted_at == null,
    );
    return { results: rows as T[] };
  }

  return null;
}

export function atlasRun(
  state: AtlasTestState,
  normalized: string,
  bound: unknown[],
): D1Result | null {
  if (
    normalized.startsWith(
      "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES",
    )
  ) {
    const [id, subject_id, template_key, created_at] = bound as [
      string,
      string,
      string,
      string,
    ];
    for (const row of state.atlases.values()) {
      if (row.subject_id === subject_id) {
        throw new Error("UNIQUE constraint failed: atlases.subject_id");
      }
    }
    state.atlases.set(id, { id, subject_id, template_key, created_at });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("INSERT INTO atlas_entries")) {
    const [
      id,
      atlas_id,
      canonical_name,
      common_name,
      fields_json,
      created_at,
      updated_at,
      origin_key,
      origin_version,
      edited_at,
      deleted_at,
    ] = bound as [
      string,
      string,
      string,
      string | null,
      string,
      string,
      string,
      string | null,
      number | null,
      string | null,
      string | null,
    ];
    for (const row of state.entries.values()) {
      if (row.atlas_id === atlas_id && row.canonical_name === canonical_name) {
        throw new Error(
          "UNIQUE constraint failed: atlas_entries.atlas_id, canonical_name",
        );
      }
    }
    state.entries.set(id, {
      id,
      atlas_id,
      canonical_name,
      common_name,
      fields_json,
      status: "accepted",
      created_at,
      updated_at,
      origin_key,
      origin_version,
      edited_at,
      deleted_at,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith("UPDATE atlas_entries") &&
    normalized.includes("SET common_name =")
  ) {
    const [common_name, fields_json, edited_at, updated_at, id, atlas_id] =
      bound as [string | null, string, string, string, string, string];
    const row = state.entries.get(id);
    if (!row || row.atlas_id !== atlas_id) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.entries.set(id, {
      ...row,
      common_name,
      fields_json,
      edited_at,
      updated_at,
      status: "accepted",
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith("UPDATE atlas_entries") &&
    normalized.includes("SET deleted_at =") &&
    normalized.includes("updated_at =")
  ) {
    // soft-delete: deleted_at, updated_at, id, atlas_id
    // restore: updated_at, id, atlas_id (deleted_at = NULL in SQL, not bound)
    if (normalized.includes("SET deleted_at = NULL")) {
      const [updated_at, id, atlas_id] = bound as [string, string, string];
      const row = state.entries.get(id);
      if (!row || row.atlas_id !== atlas_id) {
        return { success: true, meta: { changes: 0 } } as D1Result;
      }
      state.entries.set(id, { ...row, deleted_at: null, updated_at });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    const [deleted_at, updated_at, id, atlas_id] = bound as [
      string,
      string,
      string,
      string,
    ];
    const row = state.entries.get(id);
    if (!row || row.atlas_id !== atlas_id) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.entries.set(id, { ...row, deleted_at, updated_at });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("DELETE FROM atlas_entries WHERE id =")) {
    const [id, atlas_id] = bound as [string, string];
    const row = state.entries.get(id);
    if (!row || row.atlas_id !== atlas_id) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.entries.delete(id);
    for (const [refId, ref] of [...state.refs.entries()]) {
      if (ref.entry_id === id) state.refs.delete(refId);
    }
    for (const [imageId, image] of [...state.images.entries()]) {
      if (image.entry_id === id) state.images.delete(imageId);
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("INSERT INTO atlas_entry_refs")) {
    const [
      id,
      entry_id,
      field_key,
      citation,
      url,
      material_id,
      page,
      note,
      created_at,
    ] = bound as [
      string,
      string,
      string | null,
      string,
      string | null,
      string | null,
      number | null,
      string | null,
      string,
    ];
    state.refs.set(id, {
      id,
      entry_id,
      field_key,
      citation,
      url,
      material_id,
      page,
      note,
      user_added: 1,
      created_at,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("DELETE FROM atlas_entry_refs WHERE id =")) {
    const [id, entry_id] = bound as [string, string];
    const row = state.refs.get(id);
    if (!row || row.entry_id !== entry_id) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.refs.delete(id);
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("INSERT INTO atlas_entry_images")) {
    const [
      id,
      entry_id,
      src,
      role,
      caption,
      credit,
      license,
      source_url,
      is_hero,
      created_at,
    ] = bound as [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      number,
      string,
    ];
    state.images.set(id, {
      id,
      entry_id,
      src,
      role,
      caption,
      credit,
      license,
      source_url,
      is_hero,
      user_added: 1,
      deleted_at: null,
      created_at,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith("UPDATE atlas_entry_images SET deleted_at =")
  ) {
    const [deleted_at, id, entry_id] = bound as [string, string, string];
    const row = state.images.get(id);
    if (!row || row.entry_id !== entry_id || row.deleted_at != null) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.images.set(id, { ...row, deleted_at });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  return null;
}
