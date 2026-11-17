import { HTTPException } from "hono/http-exception";
import { listFigureKeysInR2 } from "../materials/figures";
import { isAdminEmail, parseAdminEmails } from "./allowlist";
import type { AdminUserRow } from "./types";

const USER_EMAIL_SQL =
  "SELECT id, email, oauth_subject, created_at, disabled_at, sandbox_of FROM users WHERE id = ?";

export function refuseSandboxTarget(user: {
  sandbox_of?: string | null;
}) {
  if (user.sandbox_of != null) {
    throw new HTTPException(400, { message: "Cannot modify sandbox user" });
  }
}

const WIPE_MATERIAL_KEYS_SQL = `
SELECT m.r2_key FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ? AND m.r2_key IS NOT NULL
`.replace(/\s+/g, " ");

const WIPE_PDF_MATERIALS_SQL = `
SELECT m.id, m.deck_id, m.kind, m.r2_key FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ? ORDER BY m.created_at ASC
`.replace(/\s+/g, " ");

const WIPE_CARD_MEDIA_SQL = `
SELECT c.media_r2_keys_json FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ? AND c.media_r2_keys_json IS NOT NULL
`.replace(/\s+/g, " ");

const WIPE_EXPORT_KEYS_SQL =
  "SELECT r2_key FROM export_jobs WHERE user_id = ? AND r2_key IS NOT NULL";

export async function loadAdminUser(
  db: D1Database,
  id: string,
): Promise<AdminUserRow> {
  const row = await db.prepare(USER_EMAIL_SQL).bind(id).first<AdminUserRow>();
  if (!row) throw new HTTPException(404, { message: "User not found" });
  return row;
}

export function refuseAllowlistedTarget(
  email: string,
  adminEmails: string | undefined,
) {
  const allow = parseAdminEmails(adminEmails);
  if (isAdminEmail(email, allow)) {
    throw new HTTPException(400, {
      message: "Cannot modify allowlisted admin",
    });
  }
}

export async function collectUserR2Keys(
  db: D1Database,
  materials: R2Bucket,
  userId: string,
): Promise<string[]> {
  const keys = new Set<string>();
  const { results: materialKeys } = await db
    .prepare(WIPE_MATERIAL_KEYS_SQL)
    .bind(userId)
    .all<{ r2_key: string }>();
  for (const row of materialKeys ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  const { results: pdfMaterials } = await db
    .prepare(WIPE_PDF_MATERIALS_SQL)
    .bind(userId)
    .all<{ id: string; deck_id: string; kind: string }>();
  for (const row of pdfMaterials ?? []) {
    if (row.kind !== "pdf") continue;
    for (const key of await listFigureKeysInR2(materials, {
      deckId: row.deck_id,
      pdfMaterialId: row.id,
    })) {
      keys.add(key);
    }
  }
  const { results: cardMedia } = await db
    .prepare(WIPE_CARD_MEDIA_SQL)
    .bind(userId)
    .all<{ media_r2_keys_json: string }>();
  for (const row of cardMedia ?? []) {
    try {
      const parsed = JSON.parse(row.media_r2_keys_json) as unknown;
      if (Array.isArray(parsed)) {
        for (const key of parsed) {
          if (typeof key === "string" && key) keys.add(key);
        }
      }
    } catch {
      /* ignore bad JSON */
    }
  }
  const { results: exportKeys } = await db
    .prepare(WIPE_EXPORT_KEYS_SQL)
    .bind(userId)
    .all<{ r2_key: string }>();
  for (const row of exportKeys ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  return [...keys];
}
