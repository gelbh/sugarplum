/**
 * Pin and copy tesseract.js browser OCR assets into public/ocr/.
 *
 * After clone / npm prebuild: node scripts/fetch-ocr-assets.mjs
 *
 * createWorker('eng', 1, { workerPath, corePath, langPath }) expects:
 *   workerPath: /ocr/worker.min.js
 *   corePath:   /ocr/core          (directory of tesseract-core*.wasm.js + .wasm)
 *   langPath:   /ocr               (no trailing slash → /ocr/eng.traineddata.gz)
 *
 * Sources: npm tesseract.js@7, tesseract.js-core@7; eng from @tesseract.js-data (LSTM int).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocrDir = join(root, "public", "ocr");
const coreDir = join(ocrDir, "core");

/** Must match installed tesseract.js / tesseract.js-core (see package-lock). */
const TESSERACT_JS_VERSION = "7.0.0";
const TESSERACT_JS_CORE_VERSION = "7.0.0";

const ENG_TRAINEDDATA_URL =
  "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";

const WORKER = {
  src: join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  dest: join(ocrDir, "worker.min.js"),
  sha256:
    "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d",
};

/** All tesseract-core*.wasm.js builds (+ sibling .wasm) for v7 corePath directory mode. */
const CORE_FILES = [
  {
    name: "tesseract-core.wasm.js",
    sha256:
      "0bc6ce3e5fbbd0cd89706cf2fd70960e3372f4f01ee24265b26990808aaeb286",
  },
  {
    name: "tesseract-core.wasm",
    sha256:
      "c7f5ace62ac0ad065e71e9c6725f1d7cdf82e7eda8fba532cbb9563964da7098",
  },
  {
    name: "tesseract-core-simd.wasm.js",
    sha256:
      "6b61ef4e911b5cf57e656bbfe983d6e2b3711a02dd164154ddda064566e8e09d",
  },
  {
    name: "tesseract-core-simd.wasm",
    sha256:
      "7d237a13edfeb0fa2f104744fccde0a00e0c076c3e23b7a8fc7af75ec9af2c3e",
  },
  {
    name: "tesseract-core-lstm.wasm.js",
    sha256:
      "eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680",
  },
  {
    name: "tesseract-core-lstm.wasm",
    sha256:
      "66b17df6e20c5329a17ffa9c202a47eaa3e32500b253d4c7f38e7f2bc01457c3",
  },
  {
    name: "tesseract-core-simd-lstm.wasm.js",
    sha256:
      "c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38",
  },
  {
    name: "tesseract-core-simd-lstm.wasm",
    sha256:
      "34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea",
  },
  {
    name: "tesseract-core-relaxedsimd.wasm.js",
    sha256:
      "843074aa5bad1cc6421b74a86201768ced9f244795e4d81435435a61a40ce535",
  },
  {
    name: "tesseract-core-relaxedsimd.wasm",
    sha256:
      "45f8c9b516df326b6ae6b493ed3a6289df5cbd10490e7b6ff8bf5b12ea42d1da",
  },
  {
    name: "tesseract-core-relaxedsimd-lstm.wasm.js",
    sha256:
      "861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3",
  },
  {
    name: "tesseract-core-relaxedsimd-lstm.wasm",
    sha256:
      "7985c92d4c64e7267d24cadffe1b2a1da6bf8aa55fdcaf953fe94fe122a24545",
  },
];

const ENG_GZ = {
  dest: join(ocrDir, "eng.traineddata.gz"),
  sha256:
    "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
  minBytes: 2_000_000,
};

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function assertInstalledVersions() {
  const tjs = JSON.parse(
    await readFile(join(root, "node_modules", "tesseract.js", "package.json"), "utf8"),
  );
  const core = JSON.parse(
    await readFile(
      join(root, "node_modules", "tesseract.js-core", "package.json"),
      "utf8",
    ),
  );
  if (tjs.version !== TESSERACT_JS_VERSION) {
    throw new Error(
      `tesseract.js version mismatch: expected ${TESSERACT_JS_VERSION}, got ${tjs.version}`,
    );
  }
  if (core.version !== TESSERACT_JS_CORE_VERSION) {
    throw new Error(
      `tesseract.js-core version mismatch: expected ${TESSERACT_JS_CORE_VERSION}, got ${core.version}`,
    );
  }
}

async function copyAndVerify(src, dest, expectedSha256) {
  const buf = await readFile(src);
  if (buf.length === 0) {
    throw new Error(`empty file: ${src}`);
  }
  const got = sha256Hex(buf);
  if (got !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${src}: expected ${expectedSha256}, got ${got}`,
    );
  }
  await writeFile(dest, buf);
  console.log(`wrote ${buf.length} bytes → ${dest} (sha256 ok)`);
}

async function downloadAndVerify(url, dest, expectedSha256, minBytes = 1) {
  console.log(`fetch: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < minBytes) {
    throw new Error(
      `download too small (${buf.length} bytes, min ${minBytes}): ${url}`,
    );
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
  await assertInstalledVersions();
  await mkdir(coreDir, { recursive: true });

  await copyAndVerify(WORKER.src, WORKER.dest, WORKER.sha256);

  const corePkg = join(root, "node_modules", "tesseract.js-core");
  for (const { name, sha256 } of CORE_FILES) {
    await copyAndVerify(join(corePkg, name), join(coreDir, name), sha256);
  }

  await downloadAndVerify(
    ENG_TRAINEDDATA_URL,
    ENG_GZ.dest,
    ENG_GZ.sha256,
    ENG_GZ.minBytes,
  );

  console.log(
    "OCR assets ready under public/ocr (worker, core/, eng.traineddata.gz)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
