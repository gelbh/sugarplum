import type { ExportDb } from "./exportDb";
import { wrapSqlJsDb } from "./exportDbShared";

/** Minimal location/__filename for browser sql.js glue; never mutates process. */
function ensureSqlJsWorkerGlobals(): void {
  const g = globalThis as typeof globalThis & {
    __filename?: string;
    location?: { href?: string };
  };
  if (typeof g.__filename === "undefined") {
    g.__filename = "https://assets.local/sql-wasm.js";
  }
  if (typeof g.location?.href !== "string") {
    Object.defineProperty(g, "location", {
      value: { href: "https://assets.local/" },
      configurable: true,
      writable: true,
    });
  }
}

/**
 * Cloudflare Workers: import .wasm as CompiledWasm and instantiate via sql.js
 * (dynamic WASM compile is forbidden in the isolate).
 */
export async function openExportDb(): Promise<ExportDb> {
  ensureSqlJsWorkerGlobals();
  const [{ default: initSqlJs }, { default: sqlWasm }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm"),
  ]);
  if (!(sqlWasm instanceof WebAssembly.Module)) {
    throw new Error(
      `sql.js WASM import is ${Object.prototype.toString.call(sqlWasm)}, expected WebAssembly.Module`,
    );
  }
  const SQL = await initSqlJs({
    instantiateWasm(imports, receiveInstance) {
      const instance = new WebAssembly.Instance(sqlWasm, imports);
      receiveInstance(instance, sqlWasm);
      return instance.exports;
    },
  });
  return wrapSqlJsDb(new SQL.Database());
}
