import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolvePrismaConnectionString } from "@/server/db/connection";

const log: Array<"error" | "warn"> =
  process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

const prismaContext = new AsyncLocalStorage<Promise<PrismaClient>>();

async function resolveConnectionString(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return resolvePrismaConnectionString({
      isProduction: true,
      hyperdriveConnectionString: env.HYPERDRIVE?.connectionString,
    });
  }

  return resolvePrismaConnectionString({
    isProduction: false,
    databaseUrl: process.env.DATABASE_URL,
  });
}

async function createPrismaClient(): Promise<PrismaClient> {
  const connectionString = await resolveConnectionString();
  const adapter = new PrismaPg({ connectionString, maxUses: 1 });
  return new PrismaClient({ adapter, log });
}

export async function runWithPrisma<T>(fn: () => Promise<T> | T): Promise<T> {
  const clientPromise = createPrismaClient();
  try {
    return await prismaContext.run(clientPromise, async () => fn());
  } finally {
    try {
      await (await clientPromise).$disconnect();
    } catch {
      // Setup may have failed before a client existed.
    }
  }
}

function getPrisma(): Promise<PrismaClient> {
  return prismaContext.getStore() ?? createPrismaClient();
}

function createPrismaProxy(path: PropertyKey[] = []): PrismaClient {
  const apply = function apply() {};
  return new Proxy(apply, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return createPrismaProxy([...path, prop]);
    },
    apply(_target, _thisArg, args) {
      return getPrisma().then((client) => {
        let parent: unknown = client;
        for (const key of path.slice(0, -1)) {
          parent = (parent as Record<PropertyKey, unknown>)[key];
        }
        const method = path[path.length - 1];
        if (method === undefined) {
          throw new Error("Invalid Prisma client call");
        }
        const fn = (parent as Record<PropertyKey, unknown>)[method];
        if (typeof fn !== "function") {
          throw new Error(`Prisma client has no method ${String(method)}`);
        }
        return fn.apply(parent, args);
      });
    },
  }) as unknown as PrismaClient;
}

/**
 * Request-scoped Prisma client. On Cloudflare, queries go through Hyperdrive
 * (`env.HYPERDRIVE`) via `@prisma/adapter-pg`. Local `pnpm dev` uses DATABASE_URL.
 */
export const prisma = createPrismaProxy();
