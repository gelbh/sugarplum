import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { requireUser, type AuthVariables } from "../auth/session";
import { getDb } from "../db/client";
import { isAdminUser } from "./allowlist";

type AdminContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

export async function requireAdmin(
  c: AdminContext,
): Promise<{ userId: string; email: string }> {
  const userId = await requireUser(c);
  const row = await getDb(c.env)
    .prepare("SELECT email, oauth_subject FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; oauth_subject: string | null }>();
  if (!row) throw new HTTPException(401, { message: "Unauthorized" });

  if (!isAdminUser(row, c.env.ADMIN_EMAILS)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  return { userId, email: row.email };
}
