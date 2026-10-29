import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";
import { requireAdmin } from "./requireAdmin";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/users", async (c) => {
  await requireAdmin(c);
  return c.json({ users: [] });
});
