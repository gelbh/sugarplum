export type SqlParam = string | number | null;

export type ExportDb = {
  exec(sql: string): void;
  run(sql: string, params: SqlParam[]): void;
  exportBytes(): Uint8Array;
  close(): void;
};

function isCloudflareWorkerRuntime(): boolean {
  return (
    (globalThis as { navigator?: { userAgent?: string } }).navigator
      ?.userAgent === "Cloudflare-Workers"
  );
}

/**
 * Workers block sql.js dynamic WASM compile and ship node:sqlite as a stub
 * (`Illegal constructor`). On CF, import .wasm as CompiledWasm and pass it to
 * sql.js via instantiateWasm. On Node/Vitest, use DatabaseSync.
 */
export async function openExportDb(): Promise<ExportDb> {
  if (isCloudflareWorkerRuntime()) {
    return openSqlJsExportDb();
  }
  return openNodeExportDb();
}

async function openNodeExportDb(): Promise<ExportDb> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...params);
    },
    exportBytes() {
      return new Uint8Array(db.serialize());
    },
    close() {
      db.close();
    },
  };
}

function ensureSqlJsWorkerGlobals(): void {
  const g = globalThis as typeof globalThis & {
    __filename?: string;
    location?: { href?: string };
    process?: { versions?: { node?: string }; type?: string };
  };
  if (g.process?.versions?.node) {
    g.process = { ...g.process, type: "renderer" };
  }
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

async function openSqlJsExportDb(): Promise<ExportDb> {
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
  const db = new SQL.Database();
  return {
    exec(sql) {
      db.run(sql);
    },
    run(sql, params) {
      db.run(sql, params);
    },
    exportBytes() {
      return db.export();
    },
    close() {
      db.close();
    },
  };
}
