/** Cloudflare bindings + vars for the Sugarplum Worker. */
export interface Env {
  DB: D1Database;
  MATERIALS: R2Bucket;
  SESSIONS: KVNamespace;
  GENERATE_QUEUE: Queue;
  APP_URL: string;
  /** Secret: `wrangler secret put SESSION_SECRET` */
  SESSION_SECRET: string;
  /** Secret: `wrangler secret put SECRETS_WRAP_KEY` */
  SECRETS_WRAP_KEY: string;
}
