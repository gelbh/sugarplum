import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { isInsightsRangePreset } from "../../src/insights/buildSeries";
import { buildInsightsSummary } from "./buildSummary";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const insightsRoutes = new Hono<AppEnv>();

insightsRoutes.get("/summary", async (c) => {
  const userId = await requireUser(c);
  const rawTz = Number(c.req.query("tzOffsetMinutes") ?? 0);
  const tzOffsetMinutes = Number.isFinite(rawTz) ? rawTz : 0;
  const localDay = c.req.query("localDay") ?? null;
  const rawRange = Number(c.req.query("rangeDays") ?? 30);
  const rangeDays = isInsightsRangePreset(rawRange) ? rawRange : 30;
  const summary = await buildInsightsSummary(getDb(c.env), userId, {
    now: new Date(),
    tzOffsetMinutes,
    localDay,
    rangeDays,
  });
  return c.json(summary);
});
