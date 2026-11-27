#!/usr/bin/env node
/**
 * Local-only seed entry. Does not touch remote D1.
 *
 * Usage:
 *   npm run db:seed:local
 *   npm run db:seed:local -- --targets=base,insights,orchard,hygiene
 *   npm run db:seed:local -- --targets=all
 *
 * Default is base. base always runs first.
 * Unknown targets exit 1. Valid: base|insights|orchard|hygiene|all
 */

const VALID = ["base", "insights", "orchard", "hygiene", "all"];
const ALL_TARGETS = ["base", "insights", "orchard", "hygiene"];

function failUnknown() {
  console.error(`Unknown target. Valid: ${VALID.join("|")}`);
  process.exit(1);
}

function parseTargets(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return ["base"];

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
  if (parts.some((part) => !VALID.includes(part))) failUnknown();
  if (parts.includes("all")) {
    if (parts.some((part) => part !== "all")) failUnknown();
    return ALL_TARGETS;
  }

  const unique = [];
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part);
  }
  if (unique[0] !== "base") {
    return ["base", ...unique.filter((part) => part !== "base")];
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
