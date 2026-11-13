import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { buildInsightsSummary } from "./buildSummary";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const insightsRoutes = new Hono<AppEnv>();

insightsRoutes.get("/summary", async (c) => {
  const userId = await requireUser(c);
  const rawTz = Number(c.req.query("tzOffsetMinutes") ?? 0);
  const tzOffsetMinutes = Number.isFinite(rawTz) ? rawTz : 0;
  const localDay = c.req.query("localDay") ?? null;
  const summary = await buildInsightsSummary(getDb(c.env), userId, {
    now: new Date(),
    tzOffsetMinutes,
    localDay,
  });
  return c.json(summary);
});
