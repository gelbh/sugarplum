import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./env";
import { authRoutes } from "./auth/routes";
import type { AuthVariables } from "./auth/session";
import { deckRoutes, materialRoutes } from "./materials/routes";
import { subjectRoutes } from "./subjects/routes";
import { atlasRoutes } from "./atlas/routes";
import { coverRoutes } from "./covers/routes";
import { settingsRoutes } from "./settings/routes";
import { jobRoutes } from "./generation/routes";
import { cardRoutes, jobDraftRoutes } from "./cards/routes";
import { studyRoutes } from "./study/routes";
import { journeyRoutes } from "./journey/routes";
import { guestRoutes } from "./guest/import";
import { exportRoutes } from "./export/routes";
import { adminRoutes } from "./admin/routes";
import { gamificationRoutes } from "./gamification/routes";
import { calendarRoutes } from "./calendar/routes";
import { handleExportQueue } from "./export/consumer";
import type { ExportQueueMessage } from "./export/enqueue";
import { handleGenerateQueue } from "./generation/consumer";
import type { GenerateQueueMessage } from "./generation/enqueue";
import { GenerationWorkflow } from "./generation/workflow";
import { GenerationSlotDO } from "./generation/GenerationSlotDO";
import { failStaleRunningJobs } from "./generation/staleFail";
import { isAllowedMutatingOrigin } from "./security/origin";
import { getDb } from "./db/client";
import { markOptimizePendingBatch } from "./study/fsrsOptimize";
import { FSRS_CRON_MARK_LIMIT } from "../src/study/fsrsOptimizeConstants";

export { GenerationWorkflow, GenerationSlotDO };

const FSRS_CRON = "0 6 * * *";

const EXPORT_QUEUE_NAME = "sugarplum-export";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use("/api/*", async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    const appUrl = c.env?.APP_URL?.trim();
    if (!appUrl) {
      throw new HTTPException(500, {
        message: "APP_URL is not configured",
      });
    }
    const origin = c.req.header("origin");
    if (!isAllowedMutatingOrigin(origin, appUrl)) {
      throw new HTTPException(403, { message: "Forbidden origin" });
    }
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ message: "Internal Server Error" }, 500);
});

app.route("/api/auth", authRoutes);
app.route("/api/calendar", calendarRoutes);
app.route("/api/subjects", subjectRoutes);
app.route("/api/atlas", atlasRoutes);
app.route("/api/covers", coverRoutes);
app.route("/api/decks", deckRoutes);
app.route("/api/materials", materialRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/jobs", jobDraftRoutes);
app.route("/api/cards", cardRoutes);
app.route("/api/journey", journeyRoutes);
app.route("/api/study", studyRoutes);
app.route("/api/guest", guestRoutes);
app.route("/api/exports", exportRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api", gamificationRoutes);

export { app };

const worker = {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<GenerateQueueMessage | ExportQueueMessage>,
    env: Env,
  ): Promise<void> {
    if (batch.queue === EXPORT_QUEUE_NAME) {
      await handleExportQueue(
        batch as MessageBatch<ExportQueueMessage>,
        env,
      );
      return;
    }
    await handleGenerateQueue(
      batch as MessageBatch<GenerateQueueMessage>,
      env,
    );
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === FSRS_CRON) {
      await markOptimizePendingBatch(
        getDb(env),
        new Date(),
        FSRS_CRON_MARK_LIMIT,
      );
    }
    await failStaleRunningJobs(env);
  },
};

export default worker;
