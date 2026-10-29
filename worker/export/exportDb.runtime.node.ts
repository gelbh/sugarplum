import type { ExportDb } from "./exportDb";
import { wrapSqlJsDb } from "./exportDbShared";

/**
 * Node/Vitest: same sql.js API as Workers, with wasmBinary from the package file
 * so CI exercises the production SQLite surface without CompiledWasm.
 */
export async function openExportDb(): Promise<ExportDb> {
  const [{ default: initSqlJs }, wasmBinary] = await Promise.all([
    import("sql.js"),
    loadSqlWasmBytes(),
  ]);
  const SQL = await initSqlJs({ wasmBinary });
  return wrapSqlJsDb(new SQL.Database());
}

async function loadSqlWasmBytes(): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return new Uint8Array(
    await readFile(require.resolve("sql.js/dist/sql-wasm.wasm")),
  );
}
