import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { patchSqlJsModuleUndef } from "../../vite/patchSqlJsPlugin";

const require = createRequire(import.meta.url);

describe("patchSqlJsModuleUndef", () => {
  it("strips module = undefined from shipped sql-wasm-browser.js", () => {
    const path = require.resolve("sql.js/dist/sql-wasm-browser.js");
    const code = readFileSync(path, "utf8");
    expect(code).toContain("module = undefined");
    const patched = patchSqlJsModuleUndef(code);
    expect(patched).not.toBeNull();
    expect(patched).not.toContain("module = undefined");
    expect(patched).toContain(
      "/* module=undefined removed for Vite CJS interop on Workers */",
    );
  });

  it("returns null when the assignment is already gone", () => {
    expect(patchSqlJsModuleUndef("module.exports = {}")).toBeNull();
  });
});
