import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import {
  readSessionRecord,
  requireUser,
  type AuthVariables,
} from "../auth/session";
import { getDb } from "../db/client";
import { isAdminUser } from "./allowlist";

type AdminContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

export async function requireAdmin(
  c: AdminContext,
): Promise<{ userId: string; email: string }> {
  await requireUser(c);
  const session = await readSessionRecord(c);
  if (!session) throw new HTTPException(401, { message: "Unauthorized" });

  const actorId = session.record.actorUserId ?? session.record.userId;
  const row = await getDb(c.env)
    .prepare(
      "SELECT email, oauth_subject, disabled_at FROM users WHERE id = ?",
    )
    .bind(actorId)
    .first<{
      email: string;
      oauth_subject: string | null;
      disabled_at: string | null;
    }>();
  if (!row) throw new HTTPException(401, { message: "Unauthorized" });
  if (row.disabled_at != null) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (!isAdminUser(row, c.env.ADMIN_EMAILS)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  return { userId: actorId, email: row.email };
}
