import { applyD1Migrations, reset } from "cloudflare:test";
import type { Bindings } from "./types";
import {
  clearAdminOverviewPrepareCount,
  clearProgressWrites,
  clearQueueMessages,
  clearWorkflowMessages,
} from "./recorders";

/** Wipe storage + re-apply migrations (per-file D1 is shared across `it`s). */
export async function resetTestDb(env: Bindings): Promise<void> {
  clearQueueMessages();
  clearWorkflowMessages();
  clearAdminOverviewPrepareCount();
  clearProgressWrites();
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}
