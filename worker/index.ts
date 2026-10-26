import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes } from "./auth/routes";
import type { AuthVariables } from "./auth/session";
import { deckRoutes } from "./materials/routes";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.route("/api/auth", authRoutes);
app.route("/api/decks", deckRoutes);

export { app };
export default app;
