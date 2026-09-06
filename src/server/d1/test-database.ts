import { createRequire } from "node:module";
type Row = Record<string, string | number | bigint | null>;
type SqlValue = string | number | null;
interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): { all(...values: SqlValue[]): Row[]; get(...values: SqlValue[]): Row | undefined };
  close(): void;
}
// Node 22 provides this test-only module; application @types/node remains unchanged.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => Sqlite;
};
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Database } from "./db";

// Real SQLite statements and transactions, with the same D1 prepared/batch surface.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const directory = new URL("../../../d1/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort())
    sqlite.exec(readFileSync(fileURLToPath(new URL(file, directory)), "utf8"));
  sqlite.exec(readFileSync(new URL("../../../d1/cutover-readiness.sql", import.meta.url), "utf8"));
  class Prepared {
    constructor(public sql: string, public values: (string | number | null)[] = []) {}
    bind(...values: (string | number | null)[]) { return new Prepared(this.sql, values); }
    execute() {
      const query = sqlite.prepare(this.sql);
      const results = query.all(...this.values);
      return { results, success: true, meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()!.n) } };
    }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
    async first(column?: string) {
      const value = this.execute().results[0] ?? null;
      return column && value ? value[column] : value;
    }
  }
  const binding = {
    prepare(sql: string) { return new Prepared(sql); },
    async batch(statements: Prepared[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as Database;
  return { sqlite, binding, close: () => sqlite.close() };
}
