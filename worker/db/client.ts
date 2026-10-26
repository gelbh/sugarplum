import type { Env } from "../env";

/** Return the D1 binding from Worker env. */
export function getDb(env: Env): D1Database {
  return env.DB;
}
