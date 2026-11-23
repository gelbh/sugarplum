#!/usr/bin/env node
/**
 * Mechanical migrate: createTestEnv → cfEnv + harness.
 * Usage: node scripts/migrate-create-test-env.mjs <file...>
 */
import fs from "node:fs";
import path from "node:path";

const SEED_METHODS = [
  "seedUser", "seedSubject", "seedDeck", "seedMaterial", "seedAtlas",
  "seedAtlasMaterial", "seedSession", "seedSessionRecord", "seedUserSecret",
  "seedUserStudyPrefs", "seedUserStudyDay", "seedCard", "seedStudyClaim",
  "seedCardRegenOp", "seedGenerationJob", "seedUsageEvent", "seedExportJob",
  "seedSchedule", "seedReviewLog", "seedR2", "seedAchievementDef",
  "seedUserGamification",
];

const GET_ENV_ASYNC = [
  "getMaterials", "getAtlases", "getAtlasMaterials", "getExportJobs",
  "getGenerationJobs", "getUserSecrets", "getUsers", "getDecks",
  "getUserStudyPrefs", "getCards", "getStudyClaims", "getCardRegenOps",
  "getSchedules", "getReviewLogs", "getUsageEvents", "getFreeGenUsageRows",
  "getAchievementCompletions", "getXpLedger", "getR2Keys", "getR2",
  "getUserGamification", "clearCache",
];

const GET_MODULE = [
  "getQueueMessages", "getCardRegenQueueMessages", "getExportQueueMessages",
  "getWorkflowCreates", "getWorkflowTerminates", "getAdminOverviewPrepareCount",
  "getProgressWrites",
];

function harnessImportPath(file) {
  const dir = path.dirname(file);
  let rel = path.relative(dir, path.join("tests/worker/harness.ts")).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\.ts$/, "");
}

function markAsyncFunctions(src) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*function\s+\w+\s*\(/.test(lines[i])) continue;
    if (/\basync\s+function\b/.test(lines[i])) continue;
    let depth = 0;
    let started = false;
    let hasAwait = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth++; started = true; }
        else if (ch === "}") depth--;
      }
      if (started && j > i && /\bawait\b/.test(lines[j])) hasAwait = true;
      if (started && depth === 0) break;
    }
    if (hasAwait) {
      lines[i] = lines[i].replace(/^(\s*)function\s/, "$1async function ");
    }
  }
  return lines.join("\n");
}

function awaitAsyncCallSites(src) {
  const asyncFns = [...src.matchAll(/\basync\s+function\s+(\w+)/g)].map((m) => m[1]);
  let s = src;
  for (const fn of asyncFns) {
    // Skip declarations: "function fn(" / "async function fn("
    s = s.replace(
      new RegExp(`(?<!\\bfunction\\s)(?<!\\bawait\\s)(?<!\\.)\\b${fn}\\s*\\(`, "g"),
      `await ${fn}(`,
    );
  }
  return s.replace(/\bawait\s+await\s+/g, "await ");
}

function collectHarnessImports(s) {
  const set = new Set(["resetTestDb"]);
  for (const m of [...SEED_METHODS, ...GET_ENV_ASYNC, ...GET_MODULE]) {
    if (new RegExp(`\\b${m}\\s*\\(`).test(s)) set.add(m);
  }
  if (/\bBindings\b/.test(s)) set.add("type Bindings");
  if (/withTestBindings\s*\(/.test(s)) set.add("withTestBindings");
  if (/installQueueRecorders\s*\(/.test(s)) set.add("installQueueRecorders");
  if (/installWorkflowRecorders\s*\(/.test(s)) set.add("installWorkflowRecorders");
  if (/installAdminOverviewPrepareCounter\s*\(/.test(s)) set.add("installAdminOverviewPrepareCounter");
  if (/installProgressWriteRecorder\s*\(/.test(s)) set.add("installProgressWriteRecorder");
  if (/\bTEST_SECRETS_WRAP_KEY\b/.test(s)) set.add("TEST_SECRETS_WRAP_KEY");
  return [...set].sort((a, b) =>
    a.replace(/^type /, "").localeCompare(b.replace(/^type /, "")),
  );
}

function ensureAfterEachImport(s) {
  return s.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']vitest["']/,
    (m, inner) => {
      if (/\bafterEach\b/.test(inner)) return m;
      return `import { afterEach, ${inner.trim()} } from "vitest"`;
    },
  );
}

function insertResetHook(s) {
  if (s.includes("resetTestDb(cfEnv)")) return s;
  const hook = [
    "",
    "afterEach(async () => {",
    "  await resetTestDb(cfEnv);",
    "});",
    "",
  ].join("\n");
  // After the full leading import section (including multi-line imports).
  const lines = s.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("import ") || line.startsWith("}")) {
      i++;
      continue;
    }
    if (line.trim() === "" && i > 0) {
      // keep going through blank lines amid imports only if next is import
      let j = i;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].startsWith("import ")) {
        i = j;
        continue;
      }
      break;
    }
    // continuation of multi-line import
    if (i > 0 && (line.trim().startsWith("type ") || line.trim().endsWith(",") || line.includes("} from "))) {
      i++;
      continue;
    }
    break;
  }
  lines.splice(i, 0, ...hook.split("\n"));
  return lines.join("\n");
}

function transform(src, file) {
  let s = src;
  const harness = harnessImportPath(file);
  const needsQueue = /env\.get(Queue|CardRegenQueue|ExportQueue)Messages/.test(s);
  const needsAdminCounter = /env\.getAdminOverviewPrepareCount/.test(s);
  const needsProgress = /env\.getProgressWrites/.test(s);

  s = s.replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\.?\/(?:\.\.\/)*test-env["'];\s*\n/g,
    "",
  );
  s = s.replace(/ReturnType<\s*typeof\s*createTestEnv\s*>/g, "Bindings");

  s = s.replace(
    /const\s+(\w+)\s*=\s*createTestEnv\s*\(\s*\{([\s\S]*?)\}\s*\)/g,
    (_, name, opts) => {
      let expr = `withTestBindings(cfEnv, {${opts}})`;
      if (needsQueue) expr = `installQueueRecorders(${expr})`;
      if (needsAdminCounter) expr = `installAdminOverviewPrepareCounter(${expr})`;
      if (needsProgress) expr = `installProgressWriteRecorder(${expr})`;
      return `const ${name} = ${expr}`;
    },
  );
  s = s.replace(
    /const\s+(\w+)\s*=\s*createTestEnv\s*\(\s*\)/g,
    (_, name) => {
      let expr = "cfEnv";
      if (needsQueue) expr = `installQueueRecorders(${expr})`;
      if (needsAdminCounter) expr = `installAdminOverviewPrepareCounter(${expr})`;
      if (needsProgress) expr = `installProgressWriteRecorder(${expr})`;
      return `const ${name} = ${expr}`;
    },
  );
  s = s.replace(/createTestEnv\s*\(\s*\{([\s\S]*?)\}\s*\)/g, (_, opts) => {
    let expr = `withTestBindings(cfEnv, {${opts}})`;
    if (needsQueue) expr = `installQueueRecorders(${expr})`;
    return expr;
  });
  s = s.replace(/createTestEnv\s*\(\s*\)/g, () => {
    let expr = "cfEnv";
    if (needsQueue) expr = `installQueueRecorders(${expr})`;
    return expr;
  });

  for (const m of SEED_METHODS) {
    s = s.replace(new RegExp(`(?<!\\w)(\\w+)\\.${m}\\s*\\(`, "g"), `await ${m}($1, `);
  }

  for (const m of GET_ENV_ASYNC) {
    if (m === "getUserGamification" || m === "getR2") {
      s = s.replace(new RegExp(`(?<!\\w)(\\w+)\\.${m}\\s*\\(`, "g"), `await ${m}($1, `);
      continue;
    }
    if (m === "clearCache") {
      s = s.replace(/(?<!\w)(\w+)\.clearCache\s*\(\s*\)/g, "(await clearCache($1))");
      continue;
    }
    s = s.replace(
      new RegExp(`(?<!\\w)(\\w+)\\.${m}\\s*\\(\\s*\\)`, "g"),
      `(await ${m}($1))`,
    );
  }

  for (const m of GET_MODULE) {
    s = s.replace(new RegExp(`(?<!\\w)\\w+\\.${m}\\s*\\(\\s*\\)`, "g"), `${m}()`);
  }


  // Multiline: env\n  .getCards() / .seedUser(
  for (const m of GET_ENV_ASYNC) {
    if (m === "getUserGamification" || m === "getR2" || m === "clearCache") continue;
    s = s.replace(
      new RegExp(`(\\w+)\\s*\\n\\s*\\.${m}\\s*\\(\\s*\\)`, "g"),
      `(await ${m}($1))`,
    );
  }
  for (const m of SEED_METHODS) {
    s = s.replace(
      new RegExp(`(\\w+)\\s*\\n\\s*\\.${m}\\s*\\(`, "g"),
      `await ${m}($1, `,
    );
  }

  s = markAsyncFunctions(s);
  s = awaitAsyncCallSites(s);
  s = ensureAfterEachImport(s);

  // Strip unused withTestBindings later via collect
  const importBlock = [
    `import { env as cfEnv } from "cloudflare:workers";`,
    `import {\n  ${collectHarnessImports(s).join(",\n  ")},\n} from "${harness}";`,
  ].join("\n");

  if (/^import\s/m.test(s)) {
    s = s.replace(/^import\s/m, `${importBlock}\nimport `);
  } else {
    s = importBlock + "\n" + s;
  }

  // Recompute imports after insert (Bindings etc. already in s)
  // Fix import list with final collect after reset hook
  s = insertResetHook(s);

  // Rebuild harness import once with final usage
  const finalImports = collectHarnessImports(s);
  s = s.replace(
    /import \{\n[\s\S]*?\n\} from "([^"]*harness)";/,
    `import {\n  ${finalImports.join(",\n  ")},\n} from "$1";`,
  );

  s = s.replace(/\bawait\s+await\s+/g, "await ");

  if (s.includes("createTestEnv") || /from\s*["'][^"']*test-env["']/.test(s)) {
    console.warn("WARN residual createTestEnv/test-env:", file);
  }
  if (/async function await /.test(s)) {
    console.warn("WARN async function await:", file);
  }
  return s;
}

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("createTestEnv") && !/test-env/.test(src)) {
    console.log("skip", file);
    continue;
  }
  fs.writeFileSync(file, transform(src, file));
  console.log("ok", file);
}
