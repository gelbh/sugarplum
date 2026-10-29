import type { Plugin } from "vite";

const MODULE_UNDEF = /module\s*=\s*undefined\s*;/;

/** Pure transform used by the Vite plugin and unit tests. */
export function patchSqlJsModuleUndef(code: string): string | null {
  if (!code.includes("module = undefined")) return null;
  if (!MODULE_UNDEF.test(code)) return null;
  return code.replace(
    MODULE_UNDEF,
    "/* module=undefined removed for Vite CJS interop on Workers */",
  );
}

/**
 * sql.js does `module = undefined` so emcc will not overwrite exports. Vite's
 * CJS interop wraps the file with a real `module` object; that assignment then
 * makes a later `module.exports = …` throw on Workers.
 */
export function patchSqlJsForWorkers(): Plugin {
  return {
    name: "patch-sqljs-for-workers",
    transform(code, id) {
      if (!/sql-wasm(?:-browser|-inline)?\.js/.test(id) && !id.includes("/sql.js/")) {
        return null;
      }
      const next = patchSqlJsModuleUndef(code);
      return next === null ? null : next;
    },
  };
}
