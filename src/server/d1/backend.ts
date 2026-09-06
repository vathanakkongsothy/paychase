export function databaseBackend(value: unknown): "neon" | "d1" {
  if (value === undefined || value === "" || value === "neon") return "neon";
  if (value === "d1") return "d1";
  throw new Error("Unsupported DATABASE_BACKEND value");
}
