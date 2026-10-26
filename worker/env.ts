/** Cloudflare bindings + vars for the Sugarplum Worker. */
export interface Env {
  DB: D1Database;
  MATERIALS: R2Bucket;
  SESSIONS: KVNamespace;
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
}
