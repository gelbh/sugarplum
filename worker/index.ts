import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes } from "./auth/routes";
import type { AuthVariables } from "./auth/session";
import { deckRoutes, materialRoutes } from "./materials/routes";
import { settingsRoutes } from "./settings/routes";
import { jobRoutes } from "./generation/routes";
import { handleGenerateQueue } from "./generation/consumer";
import type { GenerateQueueMessage } from "./generation/enqueue";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.route("/api/auth", authRoutes);
app.route("/api/decks", deckRoutes);
app.route("/api/materials", materialRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/jobs", jobRoutes);

export { app };

const worker = {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<GenerateQueueMessage>,
    env: Env,
  ): Promise<void> {
    await handleGenerateQueue(batch, env);
  },
};

export default worker;
