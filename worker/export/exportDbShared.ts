import type { ExportDb, SqlParam } from "./exportDb";

export function wrapSqlJsDb(db: {
  run(sql: string, params?: unknown[]): void;
  export(): Uint8Array;
  close(): void;
}): ExportDb {
  return {
    exec(sql) {
      db.run(sql);
    },
    run(sql, params: SqlParam[]) {
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
