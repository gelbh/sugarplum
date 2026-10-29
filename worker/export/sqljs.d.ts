declare module "sql.js" {
  type SqlJsConfig = {
    locateFile?: (file: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receiveInstance: (
        instance: WebAssembly.Instance,
        module: WebAssembly.Module,
      ) => void,
    ) => WebAssembly.Exports;
  };

  type Database = {
    run(sql: string, params?: unknown[]): void;
    export(): Uint8Array;
    close(): void;
  };

  type SqlJs = {
    Database: new () => Database;
  };

  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJs>;
  export default initSqlJs;
}

declare module "sql.js/dist/sql-wasm.wasm" {
  const sqlWasm: WebAssembly.Module;
  export default sqlWasm;
}
