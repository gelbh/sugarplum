import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NODE_ONLY_WORKER_TESTS } from "./node-only-globs.ts";

const ROOT = join(import.meta.dirname, "../..");
const WORKER_TESTS = join(ROOT, "tests/worker");

function listWorkerTests(dir: string = WORKER_TESTS): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listWorkerTests(path));
    else if (name.name.endsWith(".test.ts")) {
      out.push(relative(ROOT, path).split("\\").join("/"));
    }
  }
  return out.sort();
}

describe("NODE_ONLY_WORKER_TESTS drift", () => {
  it("lists every worker test that imports node:sqlite", () => {
    const listed = new Set<string>(NODE_ONLY_WORKER_TESTS);
    const missing: string[] = [];
    for (const rel of listWorkerTests()) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (!/"node:sqlite"|'node:sqlite'/.test(src)) continue;
      if (!listed.has(rel)) missing.push(rel);
    }
    expect(missing, "add these to NODE_ONLY_WORKER_TESTS").toEqual([]);
  });
});
