import type { Env } from "../env";

/** Return the D1 binding from Worker env. */
export function getDb(env: Env): D1Database {
  return env.DB;
}

/** True for a D1/SQLite UNIQUE constraint failure. */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}
