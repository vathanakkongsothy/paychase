export function resolvePrismaConnectionString(input: {
  isProduction: boolean;
  hyperdriveConnectionString?: string;
  databaseUrl?: string;
}): string {
  if (input.isProduction) {
    const hyperdrive = input.hyperdriveConnectionString?.trim();
    if (!hyperdrive) {
      throw new Error("HYPERDRIVE binding is not configured");
    }
    return hyperdrive;
  }

  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return databaseUrl;
}
