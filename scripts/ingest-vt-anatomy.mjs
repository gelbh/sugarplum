#!/usr/bin/env node
/**
 * Copy VT-ARIES Production GLBs into public/anatomy/{species}
 * and generate scene.json + CREDITS.md. Expects a local checkout of
 * VT-ARIES/Anatomy with Production models under --src (default /tmp/vt-anatomy).
 * Optional: --only=Canine (or Equine|Bovine) to ingest one species.
 * Optional: --no-meshopt to skip meshopt+quantize after copy (default: compress).
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compressGlbFile,
  meshoptEnabledFromArgv,
} from "./anatomyMeshopt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "anatomy");
const SPECIES = ["Canine", "Equine", "Bovine"];
const DEFAULT_SRC = "/tmp/vt-anatomy/models";

const srcRoot = process.argv
  .find((a) => a.startsWith("--src="))
  ?.slice("--src=".length) || DEFAULT_SRC;

const onlyArg = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length);

const meshoptOn = meshoptEnabledFromArgv(process.argv);

const CREDITS = (species) => `# ${species} anatomy — credits

Mesh source: Virginia Tech Virtual Animal Project (VT-ARIES Anatomy),
\`models/${species}/**/*.glb\` from
https://github.com/VT-ARIES/Anatomy (Production).

## License

Commercial exception for these GLB files (VT 3D Assets / Daniel Whitfield):
you may use them in commercial products and projects without a separate paid
license and without fees. Attribution is not required. The exception covers
GLB files only (not other asset types from that repository unless stated
separately).

Thank you to the Virginia Tech Virtual Animal Project / ARIES team for making
these models available.
`;

function slugify(parts) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function labelFromParts(parts) {
  return parts
    .map((p) => p.replace(/_/g, " "))
    .join(" · ");
}

function regionKeyFromRel(relDir) {
  const parts = relDir.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) return "root";
  return slugify(parts);
}

function walkGlbs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkGlbs(full, acc);
    else if (name.toLowerCase().endsWith(".glb")) acc.push(full);
  }
  return acc;
}

function humanLabel(fileBase) {
  return fileBase.replace(/_/g, " ").replace(/\.glb$/i, "");
}

function structureId(regionId, fileBase) {
  const base = fileBase.replace(/\.glb$/i, "");
    const id = slugify([regionId, base]);
  if (id.length <= 80) return id;
  const h = createHash("sha1").update(id).digest("hex").slice(0, 8);
  return `${id.slice(0, 70)}-${h}`;
}

function defaultRegionId(species, regionIds) {
  const prefer =
    species === "Bovine"
      ? ["back-legs", "back-legs"]
      : ["legs-right-back"];
  for (const p of prefer) {
    if (regionIds.includes(p)) return p;
  }
  return regionIds[0];
}

async function ingestSpecies(species) {
  const speciesSrc = join(srcRoot, species);
  if (!existsSync(speciesSrc)) {
    throw new Error(`Missing source: ${speciesSrc}`);
  }
  const outId = species.toLowerCase();
  const outDir = join(OUT, outId);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const glbs = walkGlbs(speciesSrc);
  const byRegion = new Map();

  for (const full of glbs) {
    const rel = relative(speciesSrc, full);
    const relDir = dirname(rel);
    const file = rel.split(/[/\\]/).pop();
    const regionId = regionKeyFromRel(relDir === "." ? "" : relDir);
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(full, dest);
    if (meshoptOn) await compressGlbFile(dest);

    const assetPath =
      relDir === "." ? `./${file}` : `./${relDir.split(sep).join("/")}/${file}`;
    const list = byRegion.get(regionId) ?? {
      label: labelFromParts(
        (relDir === "." ? ["Root"] : relDir.split(/[/\\]/)).filter(Boolean),
      ),
      structures: [],
    };
    const node = file.replace(/\.glb$/i, "");
    list.structures.push({
      id: structureId(regionId, file),
      label: humanLabel(file),
      node,
      asset: assetPath.replace(/\\/g, "/"),
      region: regionId,
    });
    byRegion.set(regionId, list);
  }

  const regionIds = [...byRegion.keys()].sort();
  const def = defaultRegionId(species, regionIds);
  const regions = regionIds.map((id) => ({
    id,
    label: byRegion.get(id).label,
    ...(id === def ? { defaultActive: true } : {}),
  }));

  const structures = regionIds.flatMap((id) =>
    byRegion
      .get(id)
      .structures.sort((a, b) => a.label.localeCompare(b.label)),
  );

  const scene = {
    id: outId,
    title: species,
    regions,
    structures,
  };
  writeFileSync(join(outDir, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
  writeFileSync(join(outDir, "CREDITS.md"), CREDITS(species));
  console.log(
    `${outId}: ${glbs.length} glbs, ${regions.length} regions, default=${def}`,
  );
}

async function main() {
  if (!existsSync(srcRoot)) {
    console.error(`Source missing: ${srcRoot}`);
    process.exit(1);
  }
  if (onlyArg !== undefined && onlyArg.trim() === "") {
    console.error(`Empty --only=; expected one of ${SPECIES.join(", ")}`);
    process.exit(1);
  }
  const targets = onlyArg
    ? SPECIES.filter((s) => s.toLowerCase() === onlyArg.toLowerCase())
    : SPECIES;
  if (onlyArg && targets.length === 0) {
    console.error(`Unknown --only=${onlyArg}; expected one of ${SPECIES.join(", ")}`);
    process.exit(1);
  }
  for (const sp of targets) await ingestSpecies(sp);
  const limb = join(OUT, "canine-limb");
  if (existsSync(limb)) {
    rmSync(limb, { recursive: true, force: true });
    console.log("removed public/anatomy/canine-limb");
  }
}

void main();
