/** Cloudflare bindings + vars for the Sugarplum Worker. */
export interface Env {
  DB: D1Database;
  MATERIALS: R2Bucket;
  SESSIONS: KVNamespace;
  /** Static assets binding (client build output). */
  ASSETS: Fetcher;
  /** Workers AI binding for free-generation path (optional at type level for tests). */
  AI?: Ai;
  /** Optional until queue consumer ships; missing → D1 generation_jobs only. */
  GENERATE_QUEUE?: Queue;
  /** Dedicated Anki export queue; over-threshold builds must not run in HTTP. */
  EXPORT_QUEUE?: Queue;
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
  /** Optional docling-serve base URL (HTTPS in prod; e.g. http://127.0.0.1:5001 locally). */
  DOCLING_URL?: string;
  /** Required whenever DOCLING_URL is set; sent as X-Api-Key (docling-serve DOCLING_SERVE_API_KEY). */
  DOCLING_API_KEY?: string;
  /** Secret: comma-separated admin emails (`wrangler secret put ADMIN_EMAILS`). */
  ADMIN_EMAILS?: string;
  /** Public Turnstile sitekey (wrangler var). */
  TURNSTILE_SITE_KEY?: string;
  /** Secret: `wrangler secret put TURNSTILE_SECRET_KEY` */
  TURNSTILE_SECRET_KEY?: string;
  /** Secret: `wrangler secret put UNSPLASH_ACCESS_KEY` */
  UNSPLASH_ACCESS_KEY?: string;
}
