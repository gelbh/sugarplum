/** Cloudflare bindings + vars for the Sugarplum Worker. */
export interface Env {
  DB: D1Database;
  MATERIALS: R2Bucket;
  SESSIONS: KVNamespace;
  /** Workers AI binding for free-generation path (optional at type level for tests). */
  AI?: Ai;
  /** Optional until queue consumer ships; missing → D1 generation_jobs only. */
  GENERATE_QUEUE?: Queue;
  APP_URL: string;
  /** R2 S3 API account id for presigned uploads (var or secret). */
  R2_ACCOUNT_ID: string;
  /** R2 bucket name used in S3 endpoint path (defaults in code if unset). */
  R2_BUCKET_NAME?: string;
  /** Secret: `wrangler secret put SECRETS_WRAP_KEY` */
  SECRETS_WRAP_KEY: string;
  /** Secret: `wrangler secret put R2_ACCESS_KEY_ID` */
  R2_ACCESS_KEY_ID: string;
  /** Secret: `wrangler secret put R2_SECRET_ACCESS_KEY` */
  R2_SECRET_ACCESS_KEY: string;
  /** Secret: `wrangler secret put GOOGLE_CLIENT_ID` (optional until Google Sign-In is configured) */
  GOOGLE_CLIENT_ID?: string;
  /** Secret: `wrangler secret put GOOGLE_CLIENT_SECRET` */
  GOOGLE_CLIENT_SECRET?: string;
  /** Optional docling-serve base URL (server-only; e.g. http://127.0.0.1:5001). */
  DOCLING_URL?: string;
  /** Optional shared secret for docling-serve when exposed beyond localhost. */
  DOCLING_API_KEY?: string;
}
