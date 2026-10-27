/**
 * Fetch labels.json into public/models/ (ONNX loads from pinned HF at runtime).
 *
 * After clone / npm prebuild: node scripts/fetch-layout-assets.mjs
 *
 * Source (Apache-2.0): https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8
 * ORT wasm: Vite-bundled via onnxruntime-web/wasm (under 25 MiB).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "public", "models");

/** Pinned commit on Ralutet/PP-DocLayout-L-onnx-int8 (not mutable main). */
const HF_REV = "361fe8f94b5bbd2fe83d1cf3eb4b78203ba934b5";

const MODEL_FILES = [
  {
    url: `https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/${HF_REV}/labels.json`,
    dest: join(modelsDir, "labels.json"),
    sha256:
      "4d8175c77d0a82011d5aab0a23224d5e4497404c75c5726768466fd393f96790",
  },
];

const AGPL_REFUSE = /doclayout-yolo|yolo.?doclayout/i;

function assertApacheUrl(url) {
  if (AGPL_REFUSE.test(url)) {
    console.error(
      `Refusing AGPL DocLayout-YOLO URL (use Apache PP-DocLayout-L int8): ${url}`,
    );
    process.exit(1);
  }
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function downloadAndVerify(url, dest, expectedSha256) {
  assertApacheUrl(url);
  console.log(`fetch: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error(`empty download: ${url}`);
  }
  const got = sha256Hex(buf);
  if (got !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${dest}: expected ${expectedSha256}, got ${got}`,
    );
  }
  await writeFile(dest, buf);
  console.log(`wrote ${buf.length} bytes → ${dest} (sha256 ok)`);
}

async function main() {
  await mkdir(modelsDir, { recursive: true });
  for (const { url, dest, sha256 } of MODEL_FILES) {
    await downloadAndVerify(url, dest, sha256);
  }
  console.log(
    "labels ready under public/models (ONNX from pinned HF; ORT via onnxruntime-web/wasm)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
