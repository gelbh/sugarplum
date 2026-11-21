import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { datasetByKey } from "../atlas/entry-helpers";
import {
  ADMIN_LIST_CORRECTIONS_SQL,
  parseStoredDiff,
  RESOLVE_CORRECTION_SQL,
  SELECT_CORRECTION_STATUS_SQL,
} from "../atlas/corrections";
import { requireAdmin } from "./requireAdmin";
import type { AppEnv } from "./types";
import type {
  AdminAtlasCorrection,
  CorrectionStatus,
} from "../../src/atlas/types";

const STATUSES: readonly CorrectionStatus[] = ["open", "accepted", "rejected"];
const LIST_LIMIT = 200;

type ListRow = {
  id: string;
  origin_key: string;
  dataset_version: number;
  diff_json: string;
  note: string | null;
  source_url: string | null;
  status: CorrectionStatus;
  created_at: string;
  resolved_at: string | null;
  student_email: string;
};

function parseListStatus(raw: string | undefined): CorrectionStatus {
  const value = raw ?? "open";
  if ((STATUSES as readonly string[]).includes(value)) {
    return value as CorrectionStatus;
  }
  throw new HTTPException(400, {
    message: "status must be open, accepted or rejected",
  });
}

export const atlasCorrectionAdminRoutes = new Hono<AppEnv>();

atlasCorrectionAdminRoutes.get("/", async (c) => {
  await requireAdmin(c);
  const status = parseListStatus(c.req.query("status"));
  const { results } = await getDb(c.env)
    .prepare(ADMIN_LIST_CORRECTIONS_SQL)
    .bind(status, LIST_LIMIT)
    .all<ListRow>();
  const dataset = datasetByKey();
  const corrections: AdminAtlasCorrection[] = (results ?? []).map((row) => {
    const entry = dataset.get(row.origin_key);
    return {
      id: row.id,
      originKey: row.origin_key,
      canonicalName: entry?.canonicalName ?? row.origin_key,
      commonName: entry?.commonName ?? null,
      datasetVersion: row.dataset_version,
      diff: parseStoredDiff(row.diff_json),
      note: row.note,
      sourceUrl: row.source_url,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      studentEmail: row.student_email,
    };
  });
  return c.json({ corrections });
});

atlasCorrectionAdminRoutes.post("/:id", async (c) => {
  const admin = await requireAdmin(c);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const status =
    body && typeof body === "object" && "status" in body
      ? (body as { status: unknown }).status
      : undefined;
  if (status !== "accepted" && status !== "rejected") {
    throw new HTTPException(400, {
      message: "status must be accepted or rejected",
    });
  }
  const db = getDb(c.env);
  const current = await db
    .prepare(SELECT_CORRECTION_STATUS_SQL)
    .bind(id)
    .first<{ status: string }>();
  if (!current) throw new HTTPException(404, { message: "Suggestion not found" });
  if (current.status !== "open") {
    throw new HTTPException(409, { message: "Suggestion is not open" });
  }
  const resolvedAt = new Date().toISOString();
  const result = await db
    .prepare(RESOLVE_CORRECTION_SQL)
    .bind(status, resolvedAt, admin.userId, id)
    .run();
  // Another admin resolved it between the SELECT and the guarded UPDATE.
  if ((result.meta?.changes ?? 0) === 0) {
    throw new HTTPException(409, { message: "Suggestion is not open" });
  }
  return c.json({ id, status, resolvedAt });
});
