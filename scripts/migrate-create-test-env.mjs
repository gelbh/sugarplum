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
    if (!/^\s*(?:export\s+)?function\s+\w+\s*\(/.test(lines[i])) continue;
    if (/\basync\s+function\b/.test(lines[i])) continue;
    // Skip param-list braces (e.g. `args: { id: string }`); start at body `{`.
    let sigDepth = 0;
    let bodyStart = -1;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      for (let k = 0; k < line.length; k++) {
        const ch = line[k];
        if (ch === "(") sigDepth++;
        else if (ch === ")") sigDepth--;
        else if (ch === "{" && sigDepth === 0) {
          bodyStart = j;
          break;
        }
      }
      if (bodyStart >= 0) break;
    }
    if (bodyStart < 0) continue;
    let depth = 0;
    let hasAwait = false;
    for (let j = bodyStart; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (/\bawait\b/.test(lines[j])) hasAwait = true;
      if (depth === 0) break;
    }
    if (hasAwait) {
      lines[i] = lines[i].replace(
        /^(\s*)(export\s+)?function\s/,
        (_, a, e) => `${a}${e || ""}async function `,
      );
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
  s = s.replace(/\bawait\s+await\s+/g, "await ");
  // Never await vitest lifecycle helpers (awaitAsyncCallSites may hit wrongly named locals).
  s = s.replace(
    /\bawait\s+(afterEach|beforeEach|describe|it|test|suite)\s*\(/g,
    "$1(",
  );
  return s;
}

/** Mark arrow callbacks that contain await as async (e.g. fetch mocks). */
function markAsyncArrows(src) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/\basync\s*\(/.test(lines[i])) continue;
    if (/\basync\s+\(/.test(lines[i])) continue;
    // Match (...) => {  or () => { on this line
    const arrowRe = /(?:^|[=,(]\s*)(\([^)]*\)|\w+)\s*=>\s*\{/;
    if (!arrowRe.test(lines[i])) continue;
    // Skip vitest describe/it/test wrappers: they nest other async work.
    if (/\b(describe|it|test|suite|beforeEach|afterEach)\s*\(/.test(lines[i])) {
      continue;
    }
    let depth = 0;
    let started = false;
    let hasAwait = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") {
          depth++;
          started = true;
        } else if (ch === "}") depth--;
      }
      if (started && /\bawait\b/.test(lines[j])) hasAwait = true;
      if (started && depth === 0) break;
    }
    if (!hasAwait) continue;
    lines[i] = lines[i].replace(
      /(?:^|[=,(]\s*)(?:(\([^)]*\)|\w+)\s*=>\s*\{)/,
      (full, params) => full.replace(`${params} =>`, `async ${params} =>`),
    );
  }
  return lines.join("\n");
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
  // After leading imports only (never into type/const/function bodies).
  const lines = s.split("\n");
  let i = 0;
  let inImport = false;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!inImport && /^import\b/.test(trimmed)) {
      inImport = !(
        /}\s*from\s*["']/.test(line) ||
        /^import\s+["']/.test(trimmed) ||
        (/^import\s+[\w*{]/.test(trimmed) && /from\s*["']/.test(line) && !line.includes("{")) ||
        (/^import\s+type\s+\w+/.test(trimmed) && /from\s*["']/.test(line) && !line.includes("{"))
      );
      // multi-line named import: `import {` without `} from` yet
      if (line.includes("{") && !/}\s*from\s*["']/.test(line)) inImport = true;
      if (/}\s*from\s*["']/.test(line)) inImport = false;
      i++;
      continue;
    }
    if (inImport) {
      if (/}\s*from\s*["']/.test(line)) inImport = false;
      i++;
      continue;
    }
    if (trimmed === "") {
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
  // Second pass: helpers that gained await via awaited callee rewriting.
  s = markAsyncFunctions(s);
  s = awaitAsyncCallSites(s);
  s = markAsyncArrows(s);
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
