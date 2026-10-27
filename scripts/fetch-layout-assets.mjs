/**
 * Fetch first-party DocLayout model into public/models/.
 *
 * After clone (ONNX is gitignored): node scripts/fetch-layout-assets.mjs
 * Also runs as npm prebuild.
 *
 * Source (Apache-2.0): https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8
 * ORT wasm is loaded via onnxruntime-web/wasm (Vite-bundled); not copied here.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "public", "models");

/**
 * Pinned Hugging Face resolve URLs + SHA-256 of expected bytes.
 * Update both when bumping the model.
 */
const MODEL_FILES = [
  {
    url: "https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/main/pp-doclayout-l.onnx",
    dest: join(modelsDir, "pp-doclayout-l.onnx"),
    sha256:
      "9ce1ea78167419015fc8880e0e7baca9016131b1f456f6f0210ad517474dfbeb",
  },
  {
    url: "https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/main/labels.json",
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
  console.log("layout model ready under public/models (ORT via onnxruntime-web/wasm)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
