declare module "sql.js" {
  type SqlJsConfig = {
    locateFile?: (file: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
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

declare module "*.wasm?arraybuffer" {
  const wasmBinary: ArrayBuffer;
  export default wasmBinary;
}
