import { readFile, writeFile } from "node:fs/promises";

const [databaseId, databaseName] = process.argv.slice(2);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId ?? "") ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(databaseName ?? "")) {
  throw new Error("Usage: node d1/prepare-cutover.mjs VERIFIED_FRESH_D1_UUID DATABASE_NAME");
}
if (["6162208e-67d5-499e-8314-e90097e79d4c", "d48f6b9a-0d1c-4609-a99a-d069e519c49b"].includes(databaseId.toLowerCase())) {
  throw new Error("The earlier snapshots are not fresh cutover targets.");
}
const paths = ["../wrangler.jsonc", "../wrangler.d1.jsonc"].map((path) => new URL(path, import.meta.url));
const configs = await Promise.all(paths.map(async (path) => {
  const config = JSON.parse(await readFile(path, "utf8"));
  const binding = config.d1_databases?.find((entry) => entry.binding === "D1_DB");
  if (!binding) throw new Error("Expected D1_DB binding is missing");
  binding.database_id = databaseId;
  binding.database_name = databaseName;
  binding.migrations_dir = "d1/migrations";
  config.vars = { ...config.vars, DATABASE_BACKEND: "d1" };
  return config;
}));
for (const [index, path] of paths.entries()) {
  await writeFile(path, JSON.stringify(configs[index], null, 2) + "\n");
}
console.log("Prepared production and candidate configs for " + databaseName + ".");
console.log("Review and commit these changes only after fresh-source verification; this command did not deploy.");
