import { getCloudflareContext } from "@opennextjs/cloudflare";
import { databaseBackend } from "@/server/d1/backend";

export const runtime = "nodejs";

const handler = async (request: Request) => {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as typeof env & { DATABASE_BACKEND?: string; D1_DB?: D1Database };
  if (databaseBackend(bindings.DATABASE_BACKEND) === "d1") {
    if (!bindings.D1_DB)
      return Response.json({ error: "D1 database binding is missing" }, { status: 503 });
    const { app } = await import("@/server/d1/app");
    // The unflagged deployment continues to use Neon until the final data import is verified.
    return app.fetch(request, { DB: bindings.D1_DB });
  }
  const { app } = await import("@/server/api/app");
  return app.fetch(request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
