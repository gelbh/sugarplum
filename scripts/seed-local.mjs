#!/usr/bin/env node
/**
 * Local-only seed entry. Does not touch remote D1.
 *
 * Usage:
 *   npm run db:seed:local
 *   npm run db:seed:local -- --targets=base,insights,orchard,hygiene
 *   npm run db:seed:local -- --targets=all
 *
 * Default is the catalog baseline. The baseline always runs first.
 * Unknown targets exit 1 and list catalog targets plus all.
 */

import catalog from "../seed-catalog.json" with { type: "json" };

const ALL_TARGETS = [
  ...new Set(catalog.surfaces.flatMap((surface) => surface.targets)),
];
const VALID = new Set([...ALL_TARGETS, "all"]);

function failUnknown() {
  console.error(`Unknown target. Valid: ${ALL_TARGETS.join("|")}|all`);
  process.exit(1);
}

function parseTargets(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return [catalog.baseline];

  let raw = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--targets") {
      const next = args[++i];
      if (next == null || next.startsWith("-")) failUnknown();
      if (raw != null) failUnknown();
      raw = next;
      continue;
    }
    if (arg.startsWith("--targets=")) {
      if (raw != null) failUnknown();
      raw = arg.slice("--targets=".length);
      continue;
    }
    failUnknown();
  }

  if (raw == null) failUnknown();
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) failUnknown();
  if (parts.some((part) => !VALID.has(part))) failUnknown();
  const baseline = catalog.baseline;
  if (parts.includes("all")) {
    if (parts.some((part) => part !== "all")) failUnknown();
    return [baseline, ...ALL_TARGETS.filter((part) => part !== baseline)];
  }

  const unique = [];
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part);
  }
  if (unique[0] !== baseline) {
    return [baseline, ...unique.filter((part) => part !== baseline)];
  }
  return unique;
}

async function main() {
  const targets = parseTargets(process.argv);
  for (const name of targets) {
    const mod = await import(`./seed/${name}.mjs`);
    await mod.seed();
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
