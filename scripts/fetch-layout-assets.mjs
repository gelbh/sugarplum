/**
 * Fetch first-party browser layout assets into public/.
 *
 * After clone (ONNX is gitignored): node scripts/fetch-layout-assets.mjs
 *
 * Source (Apache-2.0): https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8
 *   - pp-doclayout-l.onnx (int8 weights, ~34 MB)
 *   - labels.json (class names + 640x640 input size)
 *
 * ORT wasm/mjs are copied from node_modules/onnxruntime-web/dist/
 * (run npm install first). Refuse AGPL DocLayout-YOLO URLs.
 */
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "public", "models");
const ortDir = join(root, "public", "ort");
const ortDistDir = join(root, "node_modules", "onnxruntime-web", "dist");

/** @type {const} Pinned Hugging Face resolve URLs (Apache PP-DocLayout-L int8). */
const MODEL_FILES = [
  {
    url: "https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/main/pp-doclayout-l.onnx",
    dest: join(modelsDir, "pp-doclayout-l.onnx"),
  },
  {
    url: "https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/main/labels.json",
    dest: join(modelsDir, "labels.json"),
  },
];

const AGPL_REFUSE = /doclayout-yolo|yolo.?doclayout/i;
/** Base wasm EP pair (not jsep/asyncify/jspi variants). */
const ORT_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
];

async function isNonEmptyFile(path) {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function assertApacheUrl(url) {
  if (AGPL_REFUSE.test(url)) {
    console.error(
      `Refusing AGPL DocLayout-YOLO URL (use Apache PP-DocLayout-L int8): ${url}`,
    );
    process.exit(1);
  }
}

async function downloadIfMissing(url, dest) {
  assertApacheUrl(url);
  if (await isNonEmptyFile(dest)) {
    console.log(`skip (present): ${dest}`);
    return;
  }
  console.log(`fetch: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error(`empty download: ${url}`);
  }
  await writeFile(dest, buf);
  console.log(`wrote ${buf.length} bytes → ${dest}`);
}

async function copyOrtWasm() {
  try {
    await readdir(ortDistDir);
  } catch {
    throw new Error(
      `missing ${ortDistDir}; run npm install onnxruntime-web first`,
    );
  }
  for (const name of ORT_FILES) {
    const src = join(ortDistDir, name);
    const dest = join(ortDir, name);
    if (!(await isNonEmptyFile(src))) {
      throw new Error(`missing required ORT file: ${src}`);
    }
    if (await isNonEmptyFile(dest)) {
      console.log(`skip (present): ${dest}`);
      continue;
    }
    await copyFile(src, dest);
    console.log(`copied → ${dest}`);
  }
}

async function main() {
  for (const { url } of MODEL_FILES) {
    assertApacheUrl(url);
  }
  await mkdir(modelsDir, { recursive: true });
  await mkdir(ortDir, { recursive: true });
  for (const { url, dest } of MODEL_FILES) {
    await downloadIfMissing(url, dest);
  }
  await copyOrtWasm();
  console.log("layout assets ready under public/models and public/ort");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
