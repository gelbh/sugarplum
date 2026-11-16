#!/usr/bin/env node
/**
 * Fail if any file under the given roots exceeds Cloudflare Workers
 * individual static asset size (25 MiB).
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKERS_MAX_ASSET_BYTES = 26_214_400;

/**
 * @param {string} rootDir
 * @param {number} [maxBytes]
 * @returns {string[]}
 */
export function findOversizedAssets(
  rootDir,
  maxBytes = WORKERS_MAX_ASSET_BYTES,
) {
  /** @type {string[]} */
  const hits = [];
  /** @param {string} dir */
  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && statSync(p).size > maxBytes) hits.push(p);
    }
  }
  walk(rootDir);
  return hits.sort();
}

function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error("usage: node scripts/checkWorkersAssetSize.mjs <dir>…");
    process.exit(2);
  }
  /** @type {string[]} */
  const all = [];
  for (const root of roots) {
    all.push(...findOversizedAssets(resolve(root)));
  }
  if (all.length === 0) return;
  for (const p of all) console.error(p);
  console.error(
    `error: ${all.length} file(s) exceed Workers static asset limit (${WORKERS_MAX_ASSET_BYTES} bytes)`,
  );
  process.exit(1);
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) main();
