import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes } from "./auth/routes";
import type { AuthVariables } from "./auth/session";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.route("/api/auth", authRoutes);

export { app };
export default app;
