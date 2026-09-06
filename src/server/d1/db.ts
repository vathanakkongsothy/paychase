import { AsyncLocalStorage } from "node:async_hooks";
import contract from "../../../d1/contract.json";

export type Database = Pick<D1Database, "prepare" | "batch">;
const context = new AsyncLocalStorage<Database>();
type Value = string | number | bigint | boolean | Date | object | null | undefined;
export function withDatabase<T>(database: Database, fn: () => T): T {
  return context.run(database, fn);
}
export function database(): Database {
  const db = context.getStore();
  if (!db) throw new Error("D1 request context is missing");
  return db;
}
export class DataError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}
const tables = new Map(contract.tables.map((table) => [table.name, table.columns]));
function columns(table: string) {
  const result = tables.get(table);
  if (!result) throw new Error("Unknown database table");
  return result;
}
function quote(value: string) { return '"' + value.replaceAll('"', '""') + '"'; }
export function timestamp(value = new Date()): string {
  if (!Number.isFinite(value.getTime())) throw new DataError("Invalid date");
  return value.toISOString().replace("Z", "+00:00");
}
export function signedMoney(value: number | string): bigint {
  const text = String(value);
  const match = text.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new DataError("Amounts must have at most two decimal places.");
  const result = BigInt(match[1] + match[2] + (match[3] ?? "").padEnd(2, "0"));
  // Preserve the source NUMERIC(12,2) range, well within D1's safe integer range.
  if (result > 999999999999n || result < -999999999999n) throw new DataError("Amount exceeds the supported range.");
  return result;
}
export function money(value: number | string): bigint {
  const result = signedMoney(value);
  if (result < 0n) throw new DataError("Amount must be nonnegative.");
  return result;
}
export function amount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new DataError("Amount exceeds the exact reporting range.");
  return Number(value) / 100;
}
export function optionalMoney(value: number | string | null | undefined) {
  return value == null ? value : signedMoney(value);
}
function bind(value: Value): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return timestamp(value);
  if (typeof value === "bigint") {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw new DataError("Unsafe integer binding");
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new DataError("Invalid numeric binding");
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}
export function statement(sql: string, values: Value[] = []): D1PreparedStatement {
  return database().prepare(sql).bind(...values.map(bind));
}
export async function batch(statements: D1PreparedStatement[]) {
  if (!statements.length) return [];
  try {
    return await database().batch(statements);
  } catch (error) {
    if (String(error).includes("malformed JSON"))
      throw new DataError("This record changed. Refresh and try again.", 409);
    if (String(error).includes("UNIQUE constraint failed"))
      throw new DataError("This record already exists.", 409);
    throw error;
  }
}
export function guard(condition: string, values: Value[] = []) {
  // Evaluated inside the same batch. A false invariant aborts every statement.
  return statement("SELECT CASE WHEN (" + condition + ") THEN 1 ELSE json('D1_CONFLICT') END", values);
}
export function insert(table: string, data: Record<string, Value>) {
  const known = columns(table);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  for (const [key] of entries)
    if (!known.some((column) => column.name === key)) throw new Error("Unknown insert field: " + key);
  return statement(
    "INSERT INTO " + quote(table) + " (" + entries.map(([key]) => quote(key)).join(",") +
    ") VALUES (" + entries.map(() => "?").join(",") + ")",
    entries.map(([, value]) => value),
  );
}
export function update(table: string, data: Record<string, Value>, where: string, values: Value[] = []) {
  const known = columns(table);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  for (const [key] of entries)
    if (!known.some((column) => column.name === key)) throw new Error("Unknown update field: " + key);
  return statement("UPDATE " + quote(table) + " SET " +
    entries.map(([key]) => quote(key) + "=?").concat(table === "Invoice" ? ['"d1Revision"="d1Revision"+1'] : []).join(",") + " WHERE " + where,
    [...entries.map(([, value]) => value), ...values]);
}
export function remove(table: string, where: string, values: Value[] = []) {
  columns(table);
  return statement("DELETE FROM " + quote(table) + " WHERE " + where, values);
}
export async function rows<T>(table: string, suffix = "", values: Value[] = []): Promise<T[]> {
  const known = columns(table);
  const { results } = await statement("SELECT * FROM " + quote(table) + " " + suffix, values)
    .all<Record<string, unknown>>();
  return results.map((row) => {
    const decoded = { ...row };
    for (const column of known) {
      const value = decoded[column.name];
      if (value == null) continue;
      if (column.type === "DateTime") {
        decoded[column.name] = new Date(value as string);
        if (!Number.isFinite((decoded[column.name] as Date).getTime()))
          throw new Error("Invalid stored timestamp");
      } else if (column.type === "BigInt") {
        if (typeof value !== "number" || !Number.isSafeInteger(value))
          throw new Error("Invalid stored minor units");
        decoded[column.name] = BigInt(value);
      } else if (column.type === "Json") {
        decoded[column.name] = JSON.parse(value as string);
      }
    }
    return decoded as T;
  });
}
export async function one<T>(table: string, suffix: string, values: Value[] = []): Promise<T | null> {
  return (await rows<T>(table, suffix + " LIMIT 1", values))[0] ?? null;
}
export function id(): string { return crypto.randomUUID(); }
