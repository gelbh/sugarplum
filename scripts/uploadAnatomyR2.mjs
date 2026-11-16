#!/usr/bin/env node
/**
 * Upload an oversize anatomy GLB to the dedicated public R2 bucket.
 *
 * One-time setup (Cloudflare dashboard / wrangler):
 *   1. Create bucket `sugarplum-anatomy`
 *   2. Enable public access (custom domain preferred, or pub-*.r2.dev)
 *   3. Configure bucket CORS so the app origin can fetch GLBs (e.g. AllowedOrigins
 *      `https://sugarplum.gelbhart.dev` and local `http://127.0.0.1:*` / `http://localhost:*`,
 *      AllowedMethods GET/HEAD, AllowedHeaders `*`). Without CORS, GLTFLoader fails
 *      on cross-origin HTTPS assets even when the origin is allowlisted in the app.
 *   4. Set Vite env `VITE_ANATOMY_ASSET_ORIGIN` to that public base (no trailing slash)
 *   5. Point scene.json `asset` at `${VITE_ANATOMY_ASSET_ORIGIN}/<key>`
 *   6. Remove the binary from `public/` so Workers static assets stay ≤25 MiB
 *
 * Keys: prefer content-hashed object names when replacing assets. Reused stable
 * paths get a one-day cache TTL (no `immutable`) so re-uploads can refresh.
 *
 * Example:
 *   node scripts/uploadAnatomyR2.mjs \
 *     --file public/anatomy/equine-gait-animations/equine_gait.glb \
 *     --key equine-gait-animations/equine_gait.glb
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "sugarplum-anatomy";

/** @param {string[]} argv */
export function parseUploadArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" || a === "--key") {
      const v = argv[++i];
      if (!v) throw new Error(`missing value for ${a}`);
      out[a.slice(2)] = v;
    }
  }
  if (!out.file || !out.key) {
    throw new Error("usage: node scripts/uploadAnatomyR2.mjs --file <path> --key <objectKey>");
  }
  return out;
}

/**
 * @param {{ file: string; key: string; run?: (cmd: string, args: string[]) => { status: number | null; stderr: string } }} opts
 */
export function uploadAnatomyObject(opts) {
  const file = resolve(opts.file);
  if (!existsSync(file)) throw new Error(`file not found: ${file}`);
  const objectPath = `${BUCKET}/${opts.key.replace(/^\//, "")}`;
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    objectPath,
    "--file",
    file,
    "--remote",
    "--content-type",
    "model/gltf-binary",
    "--cache-control",
    "public, max-age=86400",
  ];
  const run =
    opts.run ??
    ((cmd, a) => {
      const r = spawnSync(cmd, a, { encoding: "utf8" });
      return { status: r.status, stderr: (r.stderr || "") + (r.stdout || "") };
    });
  const result = run("npx", args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `wrangler exited ${result.status}`);
  }
}

function main() {
  try {
    const parsed = parseUploadArgs(process.argv.slice(2));
    uploadAnatomyObject(parsed);
    console.log(`uploaded s3://${BUCKET}/${parsed.key}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) main();
