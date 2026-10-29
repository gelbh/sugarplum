import type { Plugin } from "vite";

/**
 * sql.js does `module = undefined` so emcc will not overwrite exports. Vite's
 * CJS interop wraps the file with a real `module` object; that assignment then
 * makes a later `module.exports = …` throw on Workers.
 */
export function patchSqlJsForWorkers(): Plugin {
  return {
    name: "patch-sqljs-for-workers",
    transform(code, id) {
      if (!/sql-wasm(?:-inline)?\.js/.test(id) && !id.includes("/sql.js/")) {
        return null;
      }
      if (!code.includes("module = undefined")) return null;
      return code.replace(
        /module\s*=\s*undefined\s*;/,
        "/* module=undefined removed for Vite CJS interop on Workers */",
      );
    },
  };
}
