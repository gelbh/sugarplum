#!/usr/bin/env node
/**
 * Compose an IVALA teaching mega from existing anatomy packs.
 *
 * Copies member GLBs into public/anatomy/{megaId}/{region}/, optionally baking
 * a uniform origin scale so members match the base pack's diagonal (spike gate),
 * and writes a region-staged scene.json + CREDITS.
 *
 * Usage:
 *   node scripts/compose-anatomy-mega.mjs \
 *     --megaId=canine-ivala --title="Canine (IVALA)" --base=canine-skeleton \
 *     --member=canine-skeleton:skeleton:Skeleton \
 *     --member=canine-surface-topography:surface:Surface topography \
 *     --member=canine-full-body-ecorche:muscles:Muscles
 *
 * --member=packId:regionId:Label  (label optional; defaults to regionId)
 * --scale=auto|none|<number>      per-member default: auto (baseDiag/memberDiag)
 *                                 for non-base; none for base. Override with
 *                                 --member=packId:region:Label@0.01
 * --rotate-z=<deg>                Shared bake after scale (IVALA canine: 180
 *                                 flips authored head-down into +Y-up head-up)
 * --dedupe-suffix=_1              Drop Node_1 when Node exists in the same
 *                                 member (IVALA skeleton ships coincident pairs)
 * --align=center|none|about-base  After scale/rotate, translate non-base members:
 *                                 center = match AABB centers to base;
 *                                 about-base = scale about base AABB center
 *                                 (homothety; needed when soft tissue shares
 *                                 origin with bone stubs but not AABB center)
 * Per-member override: --member=pack:region:Label@auto:about-base
 * --exclude-node-prefix=pack:b_   Skip structures in pack whose node starts
 *                                 with prefix (internal-organs bone stubs b_*)
 *
 * Safety: refuses megaId / regionId traversal; dest under public/anatomy only.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPackId, assertWithinRoot } from "./ingest-anatomy-pack.mjs";

/**
 * Prefer hardlink (same volume); fall back to copy.
 * When `exclusive` is true (dest will be baked in-place), always copy so the
 * source leaf pack inode is never overwritten.
 */
function linkOrCopy(src, dest, exclusive = false) {
  if (!exclusive) {
    try {
      linkSync(src, dest);
      return;
    } catch {
      /* fall through */
    }
  }
  copyFileSync(src, dest);
}

/** If dest GLBs share an inode with a leaf, copy-out before in-place bake. */
function breakHardlinksInDir(dir) {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".glb")) continue;
    const dest = join(dir, name);
    if (statSync(dest).nlink <= 1) continue;
    const tmp = `${dest}.tmp-exclusive`;
    copyFileSync(dest, tmp);
    unlinkSync(dest);
    renameSync(tmp, dest);
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "anatomy");
const SCALE_PY = join(ROOT, "scripts", "scale-anatomy-pack-glbs.py");
const REGION_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function argAll(name) {
  const prefix = `--${name}=`;
  return process.argv
    .filter((a) => a.startsWith(prefix))
    .map((a) => a.slice(prefix.length));
}

/** @typedef {'none' | 'center' | 'about-base' | 'bones'} AlignMode */

/**
 * Drop `Foo_1` when `Foo` is also present (coincident IVALA export pairs).
 * @param {Array<{ node?: string }>} structures
 * @param {string} suffix
 */
export function dedupeSuffixStructures(structures, suffix = "_1") {
  if (!suffix) return structures;
  const nodes = new Set(
    structures.map((s) => String(s.node ?? "")).filter(Boolean),
  );
  return structures.filter((s) => {
    const node = String(s.node ?? "");
    if (!node.endsWith(suffix)) return true;
    const base = node.slice(0, -suffix.length);
    return !nodes.has(base);
  });
}

/** @param {string} raw */
function parseAlignMode(raw) {
  if (
    raw === "none" ||
    raw === "center" ||
    raw === "about-base" ||
    raw === "bones"
  ) {
    return raw;
  }
  throw new Error(`Bad align=${raw}; use none|center|about-base|bones`);
}

/**
 * Translate after origin-scale + rotate so the bake equals scale-about-baseCenter.
 * bake order: V' = R*(s*V) + t  with  t = (1-s)*baseCenter_post.
 * @param {[number, number, number]} baseCenterPost
 * @param {number} scale
 * @returns {[number, number, number]}
 */
export function aboutBaseTranslate(baseCenterPost, scale) {
  const k = 1 - scale;
  return [
    k * baseCenterPost[0],
    k * baseCenterPost[1],
    k * baseCenterPost[2],
  ];
}

export function parseMember(raw) {
  const at = raw.lastIndexOf("@");
  let scaleSpec = "auto";
  /** @type {AlignMode | null} */
  let align = null;
  let body = raw;
  if (at !== -1) {
    const suffix = raw.slice(at + 1);
    body = raw.slice(0, at);
    const colon = suffix.indexOf(":");
    if (colon === -1) {
      scaleSpec = suffix;
    } else {
      scaleSpec = suffix.slice(0, colon);
      align = parseAlignMode(suffix.slice(colon + 1));
    }
  }
  const parts = body.split(":");
  if (parts.length < 2) {
    throw new Error(
      `Bad --member=${raw}; expected packId:regionId[:Label][@scale[:align]]`,
    );
  }
  const packId = assertPackId(parts[0]);
  const regionId = parts[1];
  if (!REGION_ID_RE.test(regionId)) {
    throw new Error(`Invalid regionId=${regionId} in --member=${raw}`);
  }
  const label = (parts.slice(2).join(":") || regionId).trim();
  /** @type {'auto' | 'none' | number} */
  let scale = "auto";
  if (scaleSpec === "auto" || scaleSpec === "none") {
    scale = scaleSpec;
  } else {
    const n = Number(scaleSpec);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Bad scale in --member=${raw}`);
    }
    scale = n;
  }
  return { packId, regionId, label, scale, align };
}

/**
 * Axis-aligned union bounds of all .glb under packDir (via Python/trimesh).
 * @param {string} packDir
 * @returns {{ diag: number; center: [number, number, number] }}
 */
/**
 * @param {string} packDir
 * @param {{ bonesOnly?: boolean }} [opts]
 */
export function packBounds(packDir, opts = {}) {
  const bonesOnly = Boolean(opts.bonesOnly);
  const py = `
import json, sys
from pathlib import Path
import numpy as np
import trimesh
d = Path(sys.argv[1])
bones_only = sys.argv[2] == "1"
mins, maxs = [], []
for glb in sorted(d.rglob("*.glb")):
  if bones_only and not glb.name.lower().startswith("b_"):
    continue
  try:
    m = trimesh.load(glb, force="scene")
    b = m.bounds
    if b is None: continue
    mins.append(b[0]); maxs.append(b[1])
  except Exception:
    pass
if not mins:
  print(json.dumps({"ok": False})); sys.exit(0)
mn = np.min(np.vstack(mins), axis=0); mx = np.max(np.vstack(maxs), axis=0)
c = ((mn + mx) / 2).tolist()
print(json.dumps({"ok": True, "diag": float(np.linalg.norm(mx - mn)), "center": c}))
`;
  const r = spawnSync("python3", ["-c", py, packDir, bonesOnly ? "1" : "0"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(
      `packBounds failed for ${packDir}: ${r.stderr || r.stdout}`,
    );
  }
  const parsed = JSON.parse(r.stdout.trim().split("\n").pop());
  if (!parsed.ok) {
    throw new Error(
      bonesOnly ? `No bone stub GLBs under ${packDir}` : `No GLBs under ${packDir}`,
    );
  }
  return {
    diag: /** @type {number} */ (parsed.diag),
    center: /** @type {[number, number, number]} */ (parsed.center),
  };
}

/** @param {string} packDir */
export function packDiagonal(packDir) {
  return packBounds(packDir).diag;
}

/**
 * @param {Array<{ node?: string }>} structures
 * @param {string} prefix
 */
export function excludeNodePrefix(structures, prefix) {
  if (!prefix) return structures;
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  const lower = prefixes.map((p) => String(p).toLowerCase()).filter(Boolean);
  return structures.filter((s) => {
    const node = String(s.node ?? "").toLowerCase();
    return !lower.some((p) => node.startsWith(p));
  });
}

/**
 * Apply scale then rotate-z about origin to a point (matches bake order).
 * @param {[number, number, number]} center
 * @param {number} scale
 * @param {number} rotateZDeg
 * @returns {[number, number, number]}
 */
export function transformCenter(center, scale, rotateZDeg) {
  let x = center[0] * scale;
  let y = center[1] * scale;
  let z = center[2] * scale;
  if (!rotateZDeg) return [x, y, z];
  const rad = (rotateZDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c, z];
}

/**
 * @param {string} dir
 * @param {number} scale
 * @param {number} [rotateZDeg]
 * @param {[number, number, number] | null} [translate]
 */
function bakeGlbs(dir, scale, rotateZDeg = 0, translate = null) {
  const args = [SCALE_PY, `--dir=${dir}`, `--scale=${scale}`];
  if (rotateZDeg) args.push(`--rotate-z=${rotateZDeg}`);
  if (translate) {
    args.push(`--translate=${translate[0]},${translate[1]},${translate[2]}`);
  }
  const r = spawnSync("python3", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`GLB bake failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

/**
 * @param {{
 *   megaId: string;
 *   title?: string;
 *   basePackId: string;
 *   members: ReturnType<typeof parseMember>[];
 *   anatomyRoot?: string;
 *   outRoot?: string;
 *   rotateZDeg?: number;
 *   dedupeSuffix?: string | null;
 *   align?: AlignMode;
 *   excludeNodePrefixes?: Map<string, string | string[]> | Record<string, string | string[]>;
 * }} opts
 */
export function composeAnatomyMega(opts) {
  const megaId = assertPackId(opts.megaId);
  const title = (opts.title?.trim() || megaId).trim();
  const anatomyRoot = resolve(opts.anatomyRoot ?? OUT);
  const outRoot = resolve(opts.outRoot ?? OUT);
  const outDir = resolve(outRoot, megaId);
  const rotateZDeg = opts.rotateZDeg ?? 0;
  /** @type {AlignMode} */
  const align = opts.align ?? "none";
  const excludeByPack =
    opts.excludeNodePrefixes instanceof Map
      ? opts.excludeNodePrefixes
      : new Map(Object.entries(opts.excludeNodePrefixes ?? {}));
  const dedupeSuffix =
    opts.dedupeSuffix === null || opts.dedupeSuffix === ""
      ? null
      : (opts.dedupeSuffix ?? "_1");
  assertWithinRoot(outRoot, outDir);

  if (!opts.members?.length) {
    throw new Error("At least one --member= is required");
  }
  const basePackId = assertPackId(opts.basePackId);
  if (!opts.members.some((m) => m.packId === basePackId)) {
    throw new Error(`--base=${basePackId} must also appear as a --member`);
  }

  const regionIds = new Set();
  for (const m of opts.members) {
    if (regionIds.has(m.regionId)) {
      throw new Error(`Duplicate regionId=${m.regionId}`);
    }
    regionIds.add(m.regionId);
  }

  const baseDir = resolve(anatomyRoot, basePackId);
  if (!existsSync(baseDir)) {
    throw new Error(`Base pack missing: ${baseDir}`);
  }
  const baseDiag = packDiagonal(baseDir);

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  /** @type {{ id: string; label: string; defaultActive?: boolean }[]} */
  const regions = [];
  /** @type {object[]} */
  const structures = [];
  /** @type {string[]} */
  const memberNotes = [];
  let meshCount = 0;
  /** @type {[number, number, number] | null} */
  let baseCenter = null;

  for (const [i, member] of opts.members.entries()) {
    const srcDir = resolve(anatomyRoot, member.packId);
    if (!existsSync(srcDir)) {
      throw new Error(`Member pack missing: ${srcDir}`);
    }
    const scenePath = join(srcDir, "scene.json");
    if (!existsSync(scenePath)) {
      throw new Error(`Missing scene.json in ${member.packId}`);
    }
    const srcScene = JSON.parse(readFileSync(scenePath, "utf8"));
    if (!Array.isArray(srcScene.structures) || srcScene.structures.length === 0) {
      throw new Error(`No structures in ${member.packId}`);
    }

    const regionDir = resolve(outDir, member.regionId);
    assertWithinRoot(outDir, regionDir);
    mkdirSync(regionDir, { recursive: true });

    let memberStructures = srcScene.structures;
    let excluded = 0;
    const excludePrefix = excludeByPack.get(member.packId);
    if (excludePrefix) {
      const before = memberStructures.length;
      memberStructures = excludeNodePrefix(memberStructures, excludePrefix);
      excluded = before - memberStructures.length;
    }
    if (dedupeSuffix) {
      const before = memberStructures.length;
      memberStructures = dedupeSuffixStructures(memberStructures, dedupeSuffix);
      excluded += before - memberStructures.length;
    }
    if (memberStructures.length === 0) {
      throw new Error(`No structures left for ${member.packId} after filters`);
    }

    /** @type {Set<string>} */
    const copied = new Set();
    for (const s of memberStructures) {
      if (!s.asset) {
        throw new Error(
          `${member.packId} structure ${s.id} missing asset (single-file packs unsupported)`,
        );
      }
      const rel = String(s.asset).replace(/^\.\//, "");
      const srcAsset = resolve(srcDir, rel);
      assertWithinRoot(srcDir, srcAsset);
      const file = rel.split(/[/\\]/).pop();
      const destAsset = resolve(regionDir, file);
      assertWithinRoot(regionDir, destAsset);
      if (!copied.has(file)) {
        // Exclusive copy whenever a shared rotate bake is planned; scale/align
        // may also bake. Hardlink only when the mega file will stay byte-identical.
        const exclusive = Boolean(rotateZDeg) || member.scale !== "none";
        linkOrCopy(srcAsset, destAsset, exclusive);
        copied.add(file);
        meshCount += 1;
      }
      const id = `${member.regionId}-${s.id}`;
      structures.push({
        id,
        label: s.label,
        node: s.node,
        asset: `./${member.regionId}/${file}`,
        region: member.regionId,
        ...(s.info ? { info: s.info } : {}),
      });
    }

    /** @type {AlignMode} */
    const memberAlign = member.align ?? align;
    const isBase = member.packId === basePackId;

    // Bounds for scale/align. `bones` uses B_*/b_* stubs from the leaf source
    // (may be excluded from the mega copy). Otherwise use copied soft-tissue.
    const alignBounds =
      !isBase && memberAlign === "bones"
        ? packBounds(srcDir, { bonesOnly: true })
        : packBounds(regionDir);

    let appliedScale = 1;
    if (!isBase) {
      let scale = member.scale;
      if (scale === "auto") {
        scale = baseDiag / alignBounds.diag;
      } else if (scale === "none") {
        scale = 1;
      }
      appliedScale = scale;
    } else if (typeof member.scale === "number") {
      appliedScale = member.scale;
    }

    /** @type {[number, number, number] | null} */
    let translate = null;
    if (!isBase && memberAlign !== "none") {
      if (!baseCenter) {
        throw new Error(
          `--align=${memberAlign} requires the base member before ${member.packId}`,
        );
      }
      if (memberAlign === "center" || memberAlign === "bones") {
        const predicted = transformCenter(
          alignBounds.center,
          appliedScale,
          rotateZDeg,
        );
        translate = [
          baseCenter[0] - predicted[0],
          baseCenter[1] - predicted[1],
          baseCenter[2] - predicted[2],
        ];
      } else if (memberAlign === "about-base") {
        translate = aboutBaseTranslate(baseCenter, appliedScale);
      }
    }

    if (appliedScale !== 1 || rotateZDeg || translate) {
      breakHardlinksInDir(regionDir);
      bakeGlbs(regionDir, appliedScale, rotateZDeg, translate);
    }

    if (isBase) {
      baseCenter = packBounds(regionDir).center;
    }

    regions.push({
      id: member.regionId,
      label: member.label,
      ...(i === 0 ? { defaultActive: true } : {}),
    });
    const orientNote = rotateZDeg ? `, rotateZ ${rotateZDeg}` : "";
    const alignNote =
      translate && memberAlign !== "none" ? `, align ${memberAlign}` : "";
    const filterNote = excluded > 0 ? `, filtered ${excluded}` : "";
    memberNotes.push(
      `- \`${member.packId}\` → region \`${member.regionId}\` (scale ${appliedScale}${orientNote}${alignNote}${filterNote})`,
    );
  }

  const scene = { id: megaId, title, regions, structures };
  writeFileSync(
    join(outDir, "scene.json"),
    `${JSON.stringify(scene, null, 2)}\n`,
  );

  const credits = `# ${title}: credits

Mesh source: Ivala GmbH / IVALA Learn (composed mega).

Member packs:
${memberNotes.join("\n")}

## License

Commercial use and redistribution in Sugarplum under letter ref
**IVALA/SPL/2026-001** (dated 14 November 2026), confirmed for this pack and
the wider listed catalog by email 2026-11-13. Same-origin hosting; Sugarplum
scene manifests; redistribute asset files to end users as part of the app.
Royalty-free, worldwide, perpetual, non-exclusive. Attribution optional;
“Powered by IVALA” appreciated.

Rights memo: \`.superpowers/memos/2026-11-13-ivala-redistribution-rights.md\`
(letterhead under \`.superpowers/memos/ivala/\`).

Compose: \`scripts/compose-anatomy-mega.mjs\` (uniform origin scale + optional
shared rotate-z / center-align bake; see
\`.superpowers/memos/2026-11-14-canine-ivala-align-spike.md\`).
`;
  writeFileSync(join(outDir, "CREDITS.md"), credits);

  return {
    megaId,
    outDir,
    meshCount,
    regionCount: regions.length,
    structureCount: structures.length,
    baseDiag,
    rotateZDeg,
  };
}

function main() {
  const megaId = argValue("megaId");
  const title = argValue("title");
  const base = argValue("base");
  const rotateZRaw = argValue("rotate-z");
  const rotateZDeg = rotateZRaw === undefined ? 0 : Number(rotateZRaw);
  if (rotateZRaw !== undefined && !Number.isFinite(rotateZDeg)) {
    console.error(`Bad --rotate-z=${rotateZRaw}`);
    process.exit(1);
  }
  const dedupeRaw = argValue("dedupe-suffix");
  const dedupeSuffix =
    dedupeRaw === "none" || dedupeRaw === ""
      ? null
      : (dedupeRaw ?? "_1");
  const alignRaw = argValue("align") ?? "none";
  /** @type {AlignMode} */
  let alignParsed;
  try {
    alignParsed = parseAlignMode(alignRaw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  /** @type {Map<string, string[]>} */
  const excludeNodePrefixes = new Map();
  for (const raw of argAll("exclude-node-prefix")) {
    const idx = raw.indexOf(":");
    if (idx <= 0) {
      console.error(
        `Bad --exclude-node-prefix=${raw}; expected packId:prefix`,
      );
      process.exit(1);
    }
    const packId = assertPackId(raw.slice(0, idx));
    const prefix = raw.slice(idx + 1);
    const prev = excludeNodePrefixes.get(packId) ?? [];
    prev.push(prefix);
    excludeNodePrefixes.set(packId, prev);
  }
  const members = argAll("member").map(parseMember);
  if (!megaId || !base || members.length === 0) {
    console.error(
      "Usage: node scripts/compose-anatomy-mega.mjs --megaId=<slug> --base=<packId> --member=pack:region[:Label][@scale[:align]]… [--title=…] [--rotate-z=180] [--dedupe-suffix=_1|none] [--align=center|none|about-base] [--exclude-node-prefix=pack:b_]",
    );
    process.exit(1);
  }
  try {
    const result = composeAnatomyMega({
      megaId,
      title,
      basePackId: base,
      members,
      rotateZDeg,
      dedupeSuffix,
      align: alignParsed,
      excludeNodePrefixes,
    });
    console.log(
      `${result.megaId}: ${result.structureCount} structures, ${result.regionCount} regions, ${result.meshCount} meshes → ${result.outDir}`,
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
