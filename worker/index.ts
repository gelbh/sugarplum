import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes } from "./auth/routes";
import type { AuthVariables } from "./auth/session";
import { deckRoutes, materialRoutes } from "./materials/routes";
import { settingsRoutes } from "./settings/routes";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.route("/api/auth", authRoutes);
app.route("/api/decks", deckRoutes);
app.route("/api/materials", materialRoutes);
app.route("/api/settings", settingsRoutes);

export { app };
export default app;
