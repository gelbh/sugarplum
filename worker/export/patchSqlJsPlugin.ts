import type { Plugin } from "vite";

/**
 * sql.js deliberately does `module = undefined` so emcc does not overwrite
 * exports. Vite's CJS interop wraps the file with a real `module` object; that
 * assignment then makes a later `module.exports = …` throw on Workers.
 */
export function patchSqlJsForWorkers(): Plugin {
  return {
    name: "patch-sqljs-for-workers",
    transform(code, id) {
      if (!id.includes("sql-wasm-inline")) return null;
      const patched = code.replace(
        /module\s*=\s*undefined\s*;/,
        "/* module=undefined removed for Vite CJS interop on Workers */",
      );
      if (patched === code) {
        this.warn(`sql.js Workers patch did not match in ${id}`);
      }
      return patched;
    },
  };
}
