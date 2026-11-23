#!/usr/bin/env node
/**
 * Generate public/problems/<slug>.html from scripts/problems/registry.mjs.
 * Usage:
 *   node scripts/generate-problem-html.mjs          # write
 *   node scripts/generate-problem-html.mjs --check  # exit 1 on drift
 */
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { PROBLEM_DOCS, PROBLEM_TYPE_BASE } from "./problems/registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "problems");
const check = process.argv.includes("--check");

/** @param {import("./problems/registry.mjs").ProblemDoc} doc */
function render(doc) {
  const typeUri = `${PROBLEM_TYPE_BASE}/${doc.slug}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${doc.slug}: Sugarplum problem type</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Alice&family=Source+Sans+3:wght@400;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./problem.css" />
  </head>
  <body>
    <main class="wrap">
      <a class="brand" href="/">Sugarplum</a>
      <article class="panel">
        <h1>${doc.slug}</h1>
        <p class="lede">${doc.lede}</p>
        <dl>
          <div>
            <dt>Type URI</dt>
            <dd>
              <code>${typeUri}</code>
            </dd>
          </div>
          <div>
            <dt>Typical status</dt>
            <dd>${doc.statusHtml}</dd>
          </div>
          <div>
            <dt>Extensions</dt>
            <dd>${doc.extensionsHtml}</dd>
          </div>
        </dl>
        <p class="remediation">${doc.remediation}</p>
      </article>
    </main>
  </body>
</html>
`;
}

function writeAll(dir) {
  mkdirSync(dir, { recursive: true });
  /** @type {string[]} */
  const written = [];
  for (const doc of PROBLEM_DOCS) {
    const path = join(dir, `${doc.slug}.html`);
    writeFileSync(path, render(doc), "utf8");
    written.push(path);
  }
  return written;
}

if (!check) {
  writeAll(OUT_DIR);
  console.log(`Wrote ${PROBLEM_DOCS.length} pages to ${OUT_DIR}`);
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "problem-html-"));
try {
  writeAll(tmp);
  let drift = false;
  for (const doc of PROBLEM_DOCS) {
    const name = `${doc.slug}.html`;
    const expected = readFileSync(join(tmp, name), "utf8");
    let actual;
    try {
      actual = readFileSync(join(OUT_DIR, name), "utf8");
    } catch {
      console.error(`missing: public/problems/${name}`);
      drift = true;
      continue;
    }
    if (actual !== expected) {
      console.error(`drift: public/problems/${name}`);
      drift = true;
    }
  }
  if (drift) {
    console.error("Run: npm run generate:problem-html");
    process.exit(1);
  }
  console.log("problem HTML check OK");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
