export type SqlParam = string | number | null;

export type ExportDb = {
  exec(sql: string): void;
  run(sql: string, params: SqlParam[]): void;
  exportBytes(): Uint8Array;
  close(): void;
};

/**
 * Vitest sets `import.meta.env.VITEST` so the Node wasmBinary runtime is used
 * (and tree-shaken out of the Worker build). Production uses CompiledWasm.
 */
export async function openExportDb(): Promise<ExportDb> {
  if (import.meta.env.VITEST) {
    return (await import("./exportDb.runtime.node")).openExportDb();
  }
  return (await import("./exportDb.runtime")).openExportDb();
}
