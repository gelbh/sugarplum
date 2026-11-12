#!/usr/bin/env node
/**
 * Encode rembg cutouts to lossless alpha WebP and optionally overwrite hosts.
 *
 * Batch rembg (outside this script; rembg 2.0.x has no -dc):
 *   rembg/python: new_session("isnet-general-use")  # never bria-rmbg (commercial)
 *   Exceptions: frog used u2net after isnet ghosted the subject.
 *
 * Usage:
 *   node scripts/cutout-host-portraits.mjs encode <cutoutDir> <destDir>
 *   node scripts/cutout-host-portraits.mjs check <dir>
 *   node scripts/cutout-host-portraits.mjs apply <encodedDir>
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOSTS = path.join(ROOT, "public/atlas/hosts");

async function listImages(dir) {
  const names = await fs.readdir(dir);
  return names
    .filter((n) => /\.(webp|png)$/i.test(n))
    .map((n) => path.join(dir, n));
}

async function hasAlpha(file) {
  const { channels, hasAlpha } = await sharp(file).metadata();
  return Boolean(hasAlpha) && (channels ?? 0) >= 4;
}

/** Reject near-empty / ghost mattes (AC7). */
async function ghostScore(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let soft = 0;
  let subA = 0;
  let subN = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a >= 250) {
      opaque++;
      subA += a;
      subN++;
    } else if (a > 5) {
      soft++;
      subA += a;
      subN++;
    }
  }
  const px = info.width * info.height;
  return {
    opaquePct: (100 * opaque) / px,
    softPct: (100 * soft) / px,
    meanSub: subN ? subA / subN : 0,
  };
}

async function encodeDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const files = await listImages(srcDir);
  if (!files.length) throw new Error(`no images in ${srcDir}`);
  for (const src of files) {
    const base = path.basename(src, path.extname(src)) + ".webp";
    const dest = path.join(destDir, base);
    await sharp(src).ensureAlpha().webp({ lossless: true }).toFile(dest);
    if (!(await hasAlpha(dest))) {
      throw new Error(`missing alpha after encode: ${dest}`);
    }
  }
  console.log(`encoded ${files.length} → ${destDir}`);
}

async function checkDir(dir) {
  const files = await listImages(dir);
  const bad = [];
  const ghosts = [];
  for (const f of files) {
    if (!(await hasAlpha(f))) bad.push(path.basename(f));
  }
  if (bad.length) {
    console.error("missing alpha:", bad.join(", "));
    process.exit(1);
  }
  for (const f of files) {
    const { data, info } = await sharp(f)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const idx = (x, y) => (y * w + x) * 4 + 3;
    const corners = [
      data[idx(0, 0)],
      data[idx(w - 1, 0)],
      data[idx(0, h - 1)],
      data[idx(w - 1, h - 1)],
    ];
    if (!corners.some((a) => a < 16)) {
      console.warn(`warn: no near-transparent corner: ${path.basename(f)}`);
    }
    const g = await ghostScore(f);
    // Ghost: almost no solid subject (thermos frog failure ~0.5% opaque / mean~100)
    if (g.opaquePct < 5 && g.meanSub < 160) {
      ghosts.push(
        `${path.basename(f)} (opaque=${g.opaquePct.toFixed(1)}% meanSub=${g.meanSub.toFixed(0)})`,
      );
    }
  }
  if (ghosts.length) {
    console.error("ghost matte:", ghosts.join(", "));
    process.exit(1);
  }
  console.log(`ok alpha: ${files.length} files in ${dir}`);
}

async function applyDir(encodedDir) {
  const files = await listImages(encodedDir);
  // Refuse before any overwrite (thermos Important #3)
  await checkDir(encodedDir);
  for (const src of files) {
    const dest = path.join(HOSTS, path.basename(src));
    await fs.access(dest);
  }
  for (const src of files) {
    const dest = path.join(HOSTS, path.basename(src));
    await fs.copyFile(src, dest);
  }
  await checkDir(HOSTS);
  console.log(`applied ${files.length} → ${HOSTS}`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "encode" && a && b) await encodeDir(path.resolve(a), path.resolve(b));
else if (cmd === "check" && a) await checkDir(path.resolve(a));
else if (cmd === "apply" && a) await applyDir(path.resolve(a));
else {
  console.error(
    "usage: encode <cutoutDir> <destDir> | check <dir> | apply <encodedDir>",
  );
  process.exit(2);
}
