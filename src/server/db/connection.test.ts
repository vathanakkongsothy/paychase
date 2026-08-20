import { describe, expect, it } from "vitest";
import { resolvePrismaConnectionString } from "@/server/db/connection";

describe("resolvePrismaConnectionString", () => {
  it("uses Hyperdrive on production Workers", () => {
    expect(
      resolvePrismaConnectionString({
        isProduction: true,
        hyperdriveConnectionString: "postgres://hyperdrive.local/paychase",
        databaseUrl: "postgres://localhost/paychase",
      }),
    ).toBe("postgres://hyperdrive.local/paychase");
  });

  it("fails closed when Hyperdrive is missing in production", () => {
    expect(() =>
      resolvePrismaConnectionString({
        isProduction: true,
        databaseUrl: "postgres://localhost/paychase",
      }),
    ).toThrow("HYPERDRIVE binding is not configured");
  });

  it("uses DATABASE_URL for local development", () => {
    expect(
      resolvePrismaConnectionString({
        isProduction: false,
        databaseUrl: " postgresql://localhost/paychase ",
      }),
    ).toBe("postgresql://localhost/paychase");
  });

  it("fails closed when DATABASE_URL is missing locally", () => {
    expect(() =>
      resolvePrismaConnectionString({
        isProduction: false,
      }),
    ).toThrow("DATABASE_URL is not set");
  });
});
