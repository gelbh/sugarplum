#!/usr/bin/env node
/**
 * Enforce src domain module boundaries:
 * - Cross-domain imports must use domain index barrels only.
 * - shared/ must not import any feature domain.
 * - Composition tops (routes/, app/, and every other non-domain src top) must
 *   use barrels (or domain/kernel) unless allowlisted.
 * - domain/kernel.ts is an extra public entry when the index barrel pulls
 *   React or guest cycles (today: study, materials).
 * - domain/clientKernel.ts is the DOM/OCR public entry (materials); not for
 *   CF worker graphs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

const DOMAINS = [
  "anatomy",
  "atlas",
  "calendar",
  "deckHub",
  "draftReview",
  "export",
  "materials",
  "study",
];

/** @type {Set<string>} */
const allowlist = new Set();

const allowlistPath = join(__dirname, "module-boundaries-allowlist.json");
if (existsSync(allowlistPath)) {
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  for (const entry of raw) {
    allowlist.add(`${entry.file}\0${entry.spec}`);
  }
}

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?|import\s*\(\s*)["']([^"']+)["']/g;
const SIDE_EFFECT_RE = /import\s+["']([^"']+)["']/g;
const EXPORT_FROM_RE =
  /export\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+|[\w*]+\s+from\s+)["']([^"']+)["']/g;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walkTs(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTs(p));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/**
 * @param {string} absPath
 */
function srcRelative(absPath) {
  return relative(SRC, absPath).replace(/\\/g, "/");
}

/**
 * @param {string} fileAbs
 * @param {string} spec
 */
function resolveImport(fileAbs, spec) {
  if (!spec.startsWith(".")) return null;
  let base = resolve(dirname(fileAbs), spec);
  if (existsSync(base)) {
    try {
      if (statSync(base).isDirectory()) base = join(base, "index");
    } catch {
      /* missing */
    }
  }
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".css"];
  for (const ext of exts) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of ["/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  return base;
}

/**
 * @param {string} resolvedAbs
 */
function domainOfResolved(resolvedAbs) {
  const rel = srcRelative(resolvedAbs);
  const top = rel.split("/")[0];
  return DOMAINS.includes(top) ? top : null;
}

/**
 * @param {string} fileAbs
 */
function domainOfFile(fileAbs) {
  return domainOfResolved(fileAbs);
}

/**
 * @param {string} resolvedAbs
 */
function isBarrelTarget(resolvedAbs) {
  const rel = srcRelative(resolvedAbs);
  return /^[^/]+\/(index|kernel|clientKernel)\.tsx?$/.test(rel);
}

/**
 * @param {string} fileRel src-relative
 * @param {string} spec
 * @param {string} resolvedRel
 */
function isAllowlisted(fileRel, spec, resolvedRel) {
  if (allowlist.has(`${fileRel}\0${spec}`)) return true;
  if (extname(resolvedRel) === ".css") {
    return allowlist.has(`${fileRel}\0${spec}`);
  }
  return false;
}

/**
 * @param {string} content
 */
function collectSpecs(content) {
  /** @type {string[]} */
  const specs = [];
  for (const re of [IMPORT_RE, SIDE_EFFECT_RE, EXPORT_FROM_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) specs.push(m[1]);
  }
  return specs;
}

/** @type {{ kind: string, file: string, spec: string, toDom: string, target: string }[]} */
const violations = [];

for (const fileAbs of walkTs(SRC)) {
  const fileRel = srcRelative(fileAbs);
  const fromDom = domainOfFile(fileAbs);
  const content = readFileSync(fileAbs, "utf8");
  const zone = fileRel.startsWith("shared/")
    ? "shared"
    : fileRel.startsWith("routes/") || fileRel.startsWith("app/")
      ? "routesApp"
      : fromDom
        ? "domain"
        : "other";

  for (const spec of collectSpecs(content)) {
    if (!spec.startsWith(".")) continue;
    const resolved = resolveImport(fileAbs, spec);
    if (!resolved) continue;
    const toDom = domainOfResolved(resolved);
    if (!toDom) continue;
    const resolvedRel = srcRelative(resolved);
    const barrel = isBarrelTarget(resolved);

    if (zone === "shared") {
      violations.push({
        kind: "sharedDomain",
        file: fileRel,
        spec,
        toDom,
        target: resolvedRel,
      });
      continue;
    }

    if (zone === "routesApp" || zone === "other") {
      if (barrel || isAllowlisted(fileRel, spec, resolvedRel)) continue;
      violations.push({
        kind: zone === "routesApp" ? "routesAppDeep" : "compositionDeep",
        file: fileRel,
        spec,
        toDom,
        target: resolvedRel,
      });
      continue;
    }

    if (zone === "domain" && fromDom && fromDom !== toDom && !barrel) {
      if (isAllowlisted(fileRel, spec, resolvedRel)) continue;
      violations.push({
        kind: "crossDeep",
        file: fileRel,
        spec,
        toDom,
        target: resolvedRel,
      });
    }
  }
}

function main() {
  if (violations.length === 0) {
    console.log("check-module-boundaries: ok");
    return;
  }
  const byKind = Object.groupBy(violations, (v) => v.kind);
  for (const [kind, list] of Object.entries(byKind)) {
    console.error(`\n${kind} (${list.length}):`);
    for (const v of list) {
      console.error(`  ${v.file}: "${v.spec}" -> ${v.target}`);
    }
  }
  console.error(`\nerror: ${violations.length} module boundary violation(s)`);
  process.exit(1);
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) main();

export { DOMAINS, violations, walkTs, collectSpecs, resolveImport, domainOfResolved, isBarrelTarget };