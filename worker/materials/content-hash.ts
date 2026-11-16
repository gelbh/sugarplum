/** Server-side SHA-256 hex of material bytes (paste text or R2 object body). */
export async function sha256Hex(
  data: ArrayBuffer | Uint8Array | string,
): Promise<string> {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  // Copy into a fresh ArrayBuffer-backed view for crypto.subtle typing.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ReadyHashHit = {
  materialId: string;
  jobId: string | null;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  deck_id: string;
  source_role?: string | null;
};

type MaterialCandidate = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  source_role?: string | null;
};

type JobLite = { id: string; created_at: string };

/**
 * Ready material on this deck with the given content_hash.
 * Prefers the material whose latest job is newest; ties break on material created_at.
 */
export async function findReadyMaterialByContentHash(
  db: D1Database,
  deckId: string,
  contentHash: string,
  excludeMaterialId?: string,
): Promise<ReadyHashHit | null> {
  const { results } = await db
    .prepare(
      `SELECT id, deck_id, kind, r2_key, filename, page_count, status, created_at, source_role
       FROM materials
       WHERE deck_id = ? AND status = ? AND content_hash = ?`,
    )
    .bind(deckId, "ready", contentHash)
    .all<MaterialCandidate>();

  const candidates = (results ?? []).filter((m) => {
    if (excludeMaterialId && m.id === excludeMaterialId) return false;
    // Figure crops are generation sidecars, never reuse targets for uploads.
    if (m.r2_key?.includes("/figures/")) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  let best: ReadyHashHit | null = null;
  let bestJobAt = "";
  let bestMaterialAt = "";

  for (const m of candidates) {
    const job = await db
      .prepare(
        `SELECT id, created_at FROM generation_jobs
         WHERE material_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(m.id)
      .first<JobLite>();

    const jobAt = job?.created_at ?? "";
    const materialAt = m.created_at;
    const better =
      !best ||
      jobAt > bestJobAt ||
      (jobAt === bestJobAt && materialAt > bestMaterialAt);

    if (better) {
      bestJobAt = jobAt;
      bestMaterialAt = materialAt;
      best = {
        materialId: m.id,
        jobId: job?.id ?? null,
        kind: m.kind,
        r2_key: m.r2_key,
        filename: m.filename,
        page_count: m.page_count,
        status: m.status,
        created_at: m.created_at,
        deck_id: m.deck_id,
        source_role: m.source_role ?? "lecture",
      };
    }
  }

  return best;
}
