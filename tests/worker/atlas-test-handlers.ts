export type AtlasRow = {
  id: string;
  user_id: string;
  template_key: string;
  created_at: string;
  focus_pack_fingerprint?: string | null;
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

export type AtlasFocusRow = {
  atlas_id: string;
  entry_key: string;
  tier: string;
  reason: string;
  material_ids_json: string;
  override: string | null;
  updated_at: string;
};

export type AtlasNoteRow = {
  atlas_id: string;
  entry_key: string;
  body: string;
  updated_at: string;
};

export type AtlasMaterialRow = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  content_hash: string | null;
  source_role: string;
};

export type AtlasTestState = {
  atlases: Map<string, AtlasRow>;
  entries: Map<string, AtlasEntryRow>;
  refs: Map<string, AtlasRefRow>;
  images: Map<string, AtlasImageRow>;
  focus: Map<string, AtlasFocusRow>;
  notes: Map<string, AtlasNoteRow>;
  materials: Map<string, AtlasMaterialRow>;
};

export function initAtlasState(): AtlasTestState {
  return {
    atlases: new Map(),
    entries: new Map(),
    refs: new Map(),
    images: new Map(),
    focus: new Map(),
    notes: new Map(),
    materials: new Map(),
  };
}

function focusKey(atlasId: string, entryKey: string): string {
  return `${atlasId}\0${entryKey}`;
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
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE id =",
    )
  ) {
    return (state.atlases.get(bound[0] as string) as T) ?? null;
  }

  if (
    normalized.startsWith(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE user_id =",
    ) &&
    normalized.includes("AND template_key =")
  ) {
    const [userId, templateKey] = bound as [string, string];
    for (const row of state.atlases.values()) {
      if (row.user_id === userId && row.template_key === templateKey) {
        return row as T;
      }
    }
    return null;
  }

  if (
    normalized.startsWith(
      "SELECT id FROM atlases WHERE user_id =",
    ) &&
    normalized.includes("template_key")
  ) {
    const [userId] = bound as [string];
    for (const row of state.atlases.values()) {
      if (row.user_id === userId && row.template_key === "parasite") {
        return { id: row.id } as T;
      }
    }
    return null;
  }

  if (normalized.startsWith("SELECT id, user_id FROM atlases WHERE id =")) {
    const row = state.atlases.get(bound[0] as string);
    return row ? ({ id: row.id, user_id: row.user_id } as T) : null;
  }

  if (
    normalized.startsWith(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id =",
    )
  ) {
    const row = state.atlases.get(bound[0] as string);
    return row
      ? ({
          focus_pack_fingerprint: row.focus_pack_fingerprint ?? null,
        } as T)
      : null;
  }

  if (
    normalized.includes("FROM atlas_entry_focus WHERE atlas_id =") &&
    normalized.includes("AND entry_key =")
  ) {
    const [atlasId, entryKey] = bound as [string, string];
    const row = state.focus.get(focusKey(atlasId, entryKey));
    return (row as T) ?? null;
  }

  if (
    normalized.includes("FROM atlas_materials m") &&
    normalized.includes("INNER JOIN atlases a") &&
    normalized.includes("WHERE m.id =") &&
    normalized.includes("a.user_id =")
  ) {
    const [materialId, userId] = bound as [string, string];
    const row = state.materials.get(materialId);
    if (!row) return null;
    const atlas = state.atlases.get(row.atlas_id);
    if (!atlas || atlas.user_id !== userId) return null;
    return row as T;
  }

  if (
    normalized.includes("FROM atlas_entries WHERE id =") &&
    !normalized.includes("atlas_id =")
  ) {
    const id = bound[0] as string;
    return (state.entries.get(id) as T) ?? null;
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
    normalized.startsWith(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE user_id =",
    ) &&
    !normalized.includes("AND template_key =")
  ) {
    const userId = bound[0] as string;
    const rows = [...state.atlases.values()]
      .filter((row) => row.user_id === userId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_entries e") &&
    normalized.includes("JOIN atlases a") &&
    normalized.includes("a.user_id =") &&
    normalized.includes("origin_key IS NOT NULL")
  ) {
    const userId = bound[0] as string;
    const atlasIds = new Set(
      [...state.atlases.values()]
        .filter((a) => a.user_id === userId)
        .map((a) => a.id),
    );
    const rows = [...state.entries.values()].filter(
      (e) =>
        atlasIds.has(e.atlas_id) &&
        e.deleted_at == null &&
        e.origin_key != null,
    );
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_entries") &&
    normalized.includes("deleted_at IS NULL") &&
    normalized.includes("origin_key IS NOT NULL") &&
    !normalized.includes("atlas_id =") &&
    !normalized.includes("a.user_id")
  ) {
    const rows = [...state.entries.values()].filter(
      (e) => e.deleted_at == null && e.origin_key != null,
    );
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_entries WHERE atlas_id =") &&
    normalized.includes("deleted_at IS NULL") &&
    normalized.includes("origin_key IS NOT NULL")
  ) {
    const atlasId = bound[0] as string;
    const rows = entriesForAtlas(state, atlasId).filter(
      (e) => e.deleted_at == null && e.origin_key != null,
    );
    return { results: rows as T[] };
  }

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

  if (
    normalized.includes("FROM atlas_entry_focus WHERE atlas_id =") &&
    !normalized.includes("AND entry_key =")
  ) {
    const atlasId = bound[0] as string;
    const rows = [...state.focus.values()].filter((r) => r.atlas_id === atlasId);
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_entry_notes WHERE atlas_id =") &&
    !normalized.includes("AND entry_key =")
  ) {
    const atlasId = bound[0] as string;
    const rows = [...state.notes.values()].filter((r) => r.atlas_id === atlasId);
    return { results: rows as T[] };
  }

  if (
    normalized.includes("FROM atlas_materials") &&
    normalized.includes("WHERE atlas_id =")
  ) {
    const atlasId = bound[0] as string;
    const rows = [...state.materials.values()].filter(
      (r) => r.atlas_id === atlasId,
    );
    if (normalized.includes("ORDER BY created_at DESC")) {
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (normalized.includes("ORDER BY created_at ASC")) {
      rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
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
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES",
    )
  ) {
    const [id, user_id, template_key, created_at] = bound as [
      string,
      string,
      string,
      string,
    ];
    for (const row of state.atlases.values()) {
      if (row.user_id === user_id && row.template_key === template_key) {
        throw new Error(
          "UNIQUE constraint failed: atlases.user_id, template_key",
        );
      }
    }
    state.atlases.set(id, {
      id,
      user_id,
      template_key,
      created_at,
      focus_pack_fingerprint: null,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id =",
    )
  ) {
    const [fingerprint, atlasId] = bound as [string | null, string];
    const row = state.atlases.get(atlasId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.atlases.set(atlasId, {
      ...row,
      focus_pack_fingerprint: fingerprint,
    });
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
      if (
        origin_key != null &&
        row.atlas_id === atlas_id &&
        row.origin_key === origin_key
      ) {
        throw new Error(
          "UNIQUE constraint failed: atlas_entries.atlas_id, origin_key",
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
    normalized.includes("SET fields_json =") &&
    normalized.includes("updated_at =") &&
    !normalized.includes("common_name")
  ) {
    const [fields_json, updated_at, id, atlas_id] = bound as [
      string,
      string,
      string,
      string,
    ];
    const row = state.entries.get(id);
    if (!row || row.atlas_id !== atlas_id) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.entries.set(id, {
      ...row,
      fields_json,
      updated_at,
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

  if (
    normalized.startsWith(
      "DELETE FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key =",
    ) ||
    (normalized.startsWith("DELETE FROM atlas_entry_focus WHERE atlas_id =") &&
      normalized.includes("AND entry_key ="))
  ) {
    const [atlasId, entryKey] = bound as [string, string];
    const key = focusKey(atlasId, entryKey);
    const existed = state.focus.has(key);
    state.focus.delete(key);
    return {
      success: true,
      meta: { changes: existed ? 1 : 0 },
    } as D1Result;
  }

  if (normalized.startsWith("DELETE FROM atlas_entry_focus WHERE atlas_id =")) {
    const atlasId = bound[0] as string;
    let changes = 0;
    for (const [key, row] of [...state.focus.entries()]) {
      if (row.atlas_id === atlasId) {
        state.focus.delete(key);
        changes += 1;
      }
    }
    return { success: true, meta: { changes } } as D1Result;
  }

  if (
    normalized.startsWith("INSERT OR REPLACE INTO atlas_entry_focus") ||
    normalized.startsWith("INSERT INTO atlas_entry_focus")
  ) {
    const [
      atlas_id,
      entry_key,
      tier,
      reason,
      material_ids_json,
      override,
      updated_at,
    ] = bound as [
      string,
      string,
      string,
      string,
      string,
      string | null,
      string,
    ];
    state.focus.set(focusKey(atlas_id, entry_key), {
      atlas_id,
      entry_key,
      tier,
      reason,
      material_ids_json,
      override,
      updated_at,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith("DELETE FROM atlas_entry_notes WHERE atlas_id =") &&
    normalized.includes("AND entry_key =")
  ) {
    const [atlasId, entryKey] = bound as [string, string];
    const key = focusKey(atlasId, entryKey);
    const existed = state.notes.has(key);
    state.notes.delete(key);
    return {
      success: true,
      meta: { changes: existed ? 1 : 0 },
    } as D1Result;
  }

  if (
    normalized.startsWith("INSERT INTO atlas_entry_notes") ||
    normalized.startsWith("INSERT OR REPLACE INTO atlas_entry_notes")
  ) {
    const [atlas_id, entry_key, body, updated_at] = bound as [
      string,
      string,
      string,
      string,
    ];
    state.notes.set(focusKey(atlas_id, entry_key), {
      atlas_id,
      entry_key,
      body,
      updated_at,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("INSERT INTO atlas_materials")) {
    if (normalized.includes("content_hash")) {
      const [
        id,
        atlas_id,
        kind,
        r2_key,
        filename,
        page_count,
        status,
        created_at,
        content_hash,
        source_role,
      ] = bound as [
        string,
        string,
        string,
        string | null,
        string | null,
        number | null,
        string,
        string,
        string | null,
        string,
      ];
      state.materials.set(id, {
        id,
        atlas_id,
        kind,
        r2_key,
        filename,
        page_count,
        status,
        created_at,
        content_hash,
        source_role,
      });
    } else {
      const [
        id,
        atlas_id,
        kind,
        r2_key,
        filename,
        page_count,
        status,
        created_at,
        source_role,
      ] = bound as [
        string,
        string,
        string,
        string | null,
        string | null,
        number | null,
        string,
        string,
        string,
      ];
      state.materials.set(id, {
        id,
        atlas_id,
        kind,
        r2_key,
        filename,
        page_count,
        status,
        created_at,
        content_hash: null,
        source_role,
      });
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith(
      "UPDATE atlas_materials SET status = ?, content_hash = ?",
    )
  ) {
    const [status, content_hash, id, expectedStatus] = bound as [
      string,
      string | null,
      string,
      string,
    ];
    const row = state.materials.get(id);
    if (!row || row.status !== expectedStatus) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.materials.set(id, { ...row, status, content_hash });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (
    normalized.startsWith("UPDATE atlas_materials SET source_role = ? WHERE id =")
  ) {
    const [source_role, id] = bound as [string, string];
    const row = state.materials.get(id);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.materials.set(id, { ...row, source_role });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  if (normalized.startsWith("DELETE FROM atlas_materials WHERE id =")) {
    const [id] = bound as [string];
    const existed = state.materials.delete(id);
    return {
      success: true,
      meta: { changes: existed ? 1 : 0 },
    } as D1Result;
  }

  return null;
}
