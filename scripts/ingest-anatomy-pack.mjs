#!/usr/bin/env node
/**
 * Generic non-VT anatomy pack ingest: copy a local glTF/GLB drop into
 * `public/anatomy/{packId}` and write `scene.json` + a CREDITS stub.
 *
 * Usage:
 *   node scripts/ingest-anatomy-pack.mjs --src=/path/to/drop --packId=canine-heart
 *   node scripts/ingest-anatomy-pack.mjs --src=./drop --packId=canine-eye --title="Canine eye"
 *
 * Flags:
 *   --src=<dir>     Required. Local drop directory (vendor-sent exports only).
 *   --packId=<slug> Required. Destination id under public/anatomy/ (no / \ ..).
 *   --title=<text>  Optional. scene.json title (default: packId).
 *
 * Path A: never point --src at competitor CDN scrapes, Unity bundles, or tokens.
 * Fails if zero .glb/.gltf files are found. Overwrites an existing pack dir.
 * VT ingest stays species-specific; shared extract with ingest-vt-anatomy is a follow-up.
 *
 * Safety: refuses packId traversal; refuses any source or dest path that escapes
 * the resolved --src root or public/anatomy/{packId}.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "anatomy");

const PACK_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @param {string} packId */
export function assertPackId(packId) {
  if (!packId || typeof packId !== "string") {
    throw new Error("Missing --packId=; expected a lowercase slug");
  }
  if (
    packId.includes("..") ||
    packId.includes("/") ||
    packId.includes("\\") ||
    packId.includes("\0")
  ) {
    throw new Error(`Unsafe --packId=${packId}; path traversal refused`);
  }
  if (!PACK_ID_RE.test(packId)) {
    throw new Error(
      `Invalid --packId=${packId}; use lowercase alphanumeric + hyphens`,
    );
  }
  return packId;
}

/**
 * Resolve `candidate` and ensure it stays under `root` (both absolute).
 * @param {string} rootAbs
 * @param {string} candidateAbs
 */
export function assertWithinRoot(rootAbs, candidateAbs) {
  const root = rootAbs.endsWith(sep) ? rootAbs : `${rootAbs}${sep}`;
  if (candidateAbs !== rootAbs && !candidateAbs.startsWith(root)) {
    throw new Error(
      `Path traversal refused: ${candidateAbs} escapes ${rootAbs}`,
    );
  }
  return candidateAbs;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function slugify(parts) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function labelFromParts(parts) {
  return parts.map((p) => p.replace(/_/g, " ")).join(" · ");
}

function regionKeyFromRel(relDir) {
  const parts = relDir.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) return "root";
  return slugify(parts);
}

function humanLabel(fileBase) {
  return fileBase.replace(/_/g, " ").replace(/\.(glb|gltf)$/i, "");
}

function structureId(regionId, fileBase) {
  const base = fileBase.replace(/\.(glb|gltf)$/i, "");
  const id = slugify([regionId, base]);
  if (id.length <= 80) return id;
  const h = createHash("sha1").update(id).digest("hex").slice(0, 8);
  return `${id.slice(0, 70)}-${h}`;
}

function isMeshName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".glb") || lower.endsWith(".gltf");
}

/**
 * Walk files under dir. Skips paths that escape rootAbs.
 * Directory symlink cycles are skipped via visited realpaths.
 * @param {string} dir
 * @param {string} rootAbs
 * @param {{ meshes: Map<string, string>; extras: Map<string, string> }} acc
 *   meshes/extras: realpath → preferred relative path under rootAbs
 * @param {Set<string>} visitedDirs
 */
function walkDrop(dir, rootAbs, acc, visitedDirs = new Set()) {
  const dirReal = realpathSync(dir);
  assertWithinRoot(rootAbs, dirReal);
  if (visitedDirs.has(dirReal)) return acc;
  visitedDirs.add(dirReal);

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      const target = realpathSync(full);
      assertWithinRoot(rootAbs, target);
      const targetSt = lstatSync(target);
      if (targetSt.isDirectory()) {
        walkDrop(target, rootAbs, acc, visitedDirs);
      } else {
        const rel = relative(rootAbs, full);
        rememberFile(acc, target, rel, name);
      }
      continue;
    }
    const resolved = resolve(full);
    assertWithinRoot(rootAbs, resolved);
    if (st.isDirectory()) {
      walkDrop(full, rootAbs, acc, visitedDirs);
    } else {
      const rel = relative(rootAbs, full);
      rememberFile(acc, resolved, rel, name);
    }
  }
  return acc;
}

/**
 * Prefer a non-symlink relative path when the same realpath is seen twice.
 * @param {{ meshes: Map<string, string>; extras: Map<string, string> }} acc
 * @param {string} realPath
 * @param {string} rel
 * @param {string} name
 */
function rememberFile(acc, realPath, rel, name) {
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`Path traversal refused for relative path: ${rel}`);
  }
  const map = isMeshName(name) ? acc.meshes : acc.extras;
  // First relative path wins (dedupes in-tree symlinks to the same realpath).
  if (!map.has(realPath)) map.set(realPath, rel);
}

function creditsStub(title) {
  return `# ${title}: credits

Rights path: TODO before ship. Fill grantor + scope after letterhead / license lands.
Do not publish this pack until CREDITS names a cleared source.

Ingest: \`scripts/ingest-anatomy-pack.mjs\` (local drop only; Path A, no CDN scrape).
`;
}

/**
 * @param {{ src: string; packId: string; title?: string; outRoot?: string }} opts
 */
export function ingestAnatomyPack(opts) {
  const packId = assertPackId(opts.packId);
  const title = (opts.title?.trim() || packId).trim();
  const outRoot = opts.outRoot ?? OUT;

  if (!existsSync(opts.src)) {
    throw new Error(`Source missing: ${opts.src}`);
  }
  const srcAbs = realpathSync(resolve(opts.src));
  const outRootAbs = resolve(outRoot);
  const outDir = resolve(outRootAbs, packId);
  assertWithinRoot(outRootAbs, outDir);

  // Refuse src overlapping dest so rmSync cannot delete the drop mid-ingest.
  const outDirReal = existsSync(outDir) ? realpathSync(outDir) : outDir;
  const srcPrefix = srcAbs.endsWith(sep) ? srcAbs : `${srcAbs}${sep}`;
  const outPrefix = outDirReal.endsWith(sep) ? outDirReal : `${outDirReal}${sep}`;
  if (
    srcAbs === outDirReal ||
    srcAbs.startsWith(outPrefix) ||
    outDirReal.startsWith(srcPrefix)
  ) {
    throw new Error(
      `Refusing overlapping --src and destination: ${srcAbs} vs ${outDirReal}`,
    );
  }

  const drop = walkDrop(srcAbs, srcAbs, {
    meshes: new Map(),
    extras: new Map(),
  });
  if (drop.meshes.size === 0) {
    throw new Error(`No .glb/.gltf files under ${srcAbs}`);
  }

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  /** @param {Map<string, string>} files */
  function copyMap(files) {
    for (const [full, rel] of files) {
      const dest = resolve(outDir, rel);
      assertWithinRoot(outDir, dest);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(full, dest);
    }
  }
  copyMap(drop.extras);
  copyMap(drop.meshes);

  /** @type {Map<string, { label: string; structures: object[] }>} */
  const byRegion = new Map();
  /** @type {Set<string>} */
  const seenIds = new Set();

  for (const [, rel] of [...drop.meshes.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const relDir = dirname(rel);
    const file = rel.split(/[/\\]/).pop();
    const regionId = regionKeyFromRel(relDir === "." ? "" : relDir);
    const assetPath =
      relDir === "."
        ? `./${file}`
        : `./${relDir.split(sep).join("/")}/${file}`;
    const list = byRegion.get(regionId) ?? {
      label: labelFromParts(
        (relDir === "." ? ["Root"] : relDir.split(/[/\\]/)).filter(Boolean),
      ),
      structures: [],
    };
    const id = structureId(regionId, file);
    if (seenIds.has(id)) {
      throw new Error(
        `Duplicate structure id "${id}" from ${rel}; rename colliding meshes`,
      );
    }
    seenIds.add(id);
    // node is preferred THREE name; canvas falls back to the asset root.
    const node = file.replace(/\.(glb|gltf)$/i, "");
    list.structures.push({
      id,
      label: humanLabel(file),
      node,
      asset: assetPath.replace(/\\/g, "/"),
      region: regionId,
    });
    byRegion.set(regionId, list);
  }

  const regionIds = [...byRegion.keys()].sort();
  const regions = regionIds.map((id, i) => ({
    id,
    label: byRegion.get(id).label,
    ...(i === 0 ? { defaultActive: true } : {}),
  }));
  const structures = regionIds.flatMap((id) =>
    byRegion
      .get(id)
      .structures.sort((a, b) => a.label.localeCompare(b.label)),
  );

  const scene = { id: packId, title, regions, structures };
  const clipsPath = join(srcAbs, "clips.json");
  if (existsSync(clipsPath)) {
    const clips = JSON.parse(readFileSync(clipsPath, "utf8"));
    if (!Array.isArray(clips) || clips.length === 0) {
      throw new Error("clips.json must be a non-empty array");
    }
    scene.clips = clips;
  }
  writeFileSync(join(outDir, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
  const creditsDrop = join(srcAbs, "CREDITS.md");
  if (existsSync(creditsDrop)) {
    copyFileSync(creditsDrop, join(outDir, "CREDITS.md"));
  } else {
    writeFileSync(join(outDir, "CREDITS.md"), creditsStub(title));
  }
  return {
    packId,
    outDir,
    meshCount: drop.meshes.size,
    regionCount: regions.length,
    extraCount: drop.extras.size,
  };
}

function main() {
  const src = argValue("src");
  const packId = argValue("packId");
  const title = argValue("title");
  if (!src || !packId) {
    console.error(
      "Usage: node scripts/ingest-anatomy-pack.mjs --src=<dir> --packId=<slug> [--title=...]",
    );
    process.exit(1);
  }
  try {
    const result = ingestAnatomyPack({ src, packId, title });
    console.log(
      `${result.packId}: ${result.meshCount} meshes, ${result.regionCount} regions → ${result.outDir}`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) main();
