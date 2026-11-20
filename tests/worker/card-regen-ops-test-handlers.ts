export type CardRegenOpRow = {
  id: string;
  card_id: string;
  user_id: string;
  regen_type: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type CardRegenOpsState = {
  ops: Map<string, CardRegenOpRow>;
};

export function initCardRegenOpsState(): CardRegenOpsState {
  return { ops: new Map() };
}

export function cardRegenOpsFirst<T>(
  state: CardRegenOpsState,
  normalized: string,
  bound: unknown[],
): T | null | undefined {
  if (
    normalized.startsWith(
      "SELECT id, card_id, user_id, regen_type, status, error, created_at, finished_at FROM card_regen_ops WHERE id =",
    )
  ) {
    const row = state.ops.get(bound[0] as string);
    return (row ?? null) as T | null;
  }
  if (
    normalized.startsWith(
      "SELECT id, status, card_id FROM card_regen_ops WHERE card_id =",
    ) &&
    normalized.includes("status IN")
  ) {
    const cardId = bound[0] as string;
    const candidates = [...state.ops.values()]
      .filter(
        (o) =>
          o.card_id === cardId &&
          (o.status === "queued" || o.status === "running"),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const row = candidates[0];
    return row
      ? ({ id: row.id, status: row.status, card_id: row.card_id } as T)
      : null;
  }
  return undefined;
}

export function cardRegenOpsAll<T>(
  state: CardRegenOpsState,
  normalized: string,
  bound: unknown[],
): { results: T[] } | null {
  if (
    normalized.includes("FROM card_regen_ops") &&
    normalized.includes("status IN") &&
    normalized.includes("card_id IN")
  ) {
    const ids = new Set(bound as string[]);
    const rows = [...state.ops.values()]
      .filter(
        (o) =>
          ids.has(o.card_id) &&
          (o.status === "queued" || o.status === "running"),
      )
      .map((o) => ({ id: o.id, card_id: o.card_id, status: o.status }));
    return { results: rows as T[] };
  }
  if (
    normalized.startsWith(
      "SELECT id, created_at FROM card_regen_ops WHERE status = 'running'",
    )
  ) {
    const limit = Number(bound[0] ?? 50);
    const rows = [...state.ops.values()]
      .filter((o) => o.status === "running")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
      .map((o) => ({ id: o.id, created_at: o.created_at }));
    return { results: rows as T[] };
  }
  return null;
}

export function cardRegenOpsRun(
  state: CardRegenOpsState,
  normalized: string,
  bound: unknown[],
): D1Result | null {
  if (normalized.startsWith("INSERT INTO card_regen_ops")) {
    const [id, card_id, user_id, regen_type, status, created_at] = bound as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state.ops.set(id, {
      id,
      card_id,
      user_id,
      regen_type,
      status,
      error: null,
      created_at,
      finished_at: null,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE card_regen_ops SET status = ? WHERE id = ? AND status IN",
    )
  ) {
    const [status, id] = bound as [string, string];
    const row = state.ops.get(id);
    if (row && (row.status === "queued" || row.status === "running")) {
      state.ops.set(id, { ...row, status });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE card_regen_ops SET status = ?, error = ?, finished_at = ? WHERE id = ? AND status IN",
    )
  ) {
    const [status, error, finished_at, id] = bound as [
      string,
      string | null,
      string,
      string,
    ];
    const row = state.ops.get(id);
    if (row && (row.status === "queued" || row.status === "running")) {
      state.ops.set(id, { ...row, status, error, finished_at });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE card_regen_ops SET status = ?, error = NULL, finished_at = ? WHERE id =",
    )
  ) {
    const [status, finished_at, id] = bound as [string, string, string];
    const row = state.ops.get(id);
    if (row) {
      state.ops.set(id, { ...row, status, error: null, finished_at });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE card_regen_ops SET status = ?, error = ?, finished_at = ? WHERE id = ? AND status = 'running'",
    )
  ) {
    const [status, error, finished_at, id] = bound as [
      string,
      string,
      string,
      string,
    ];
    const row = state.ops.get(id);
    if (row && row.status === "running") {
      state.ops.set(id, { ...row, status, error, finished_at });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  return null;
}
