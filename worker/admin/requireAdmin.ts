import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { requireUser, type AuthVariables } from "../auth/session";
import { getDb } from "../db/client";
import { isAdminEmail, parseAdminEmails } from "./allowlist";

type AdminContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

export async function requireAdmin(
  c: AdminContext,
): Promise<{ userId: string; email: string }> {
  const userId = await requireUser(c);
  const row = await getDb(c.env)
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  if (!row) throw new HTTPException(401, { message: "Unauthorized" });

  const allow = parseAdminEmails(c.env.ADMIN_EMAILS);
  if (!isAdminEmail(row.email, allow)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  return { userId, email: row.email };
}
