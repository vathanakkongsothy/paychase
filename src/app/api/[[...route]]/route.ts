import { app } from "@/server/api/app";

export const runtime = "nodejs";

const handler = async (request: Request) => app.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
