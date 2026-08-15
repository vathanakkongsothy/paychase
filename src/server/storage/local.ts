import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredObject = {
  url: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || "./uploads");
}

function getR2Bucket(): R2Bucket | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { UPLOADS?: R2Bucket } };
    };
    return getCloudflareContext()?.env?.UPLOADS ?? null;
  } catch {
    return null;
  }
}

export async function storeInvoiceFile(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<StoredObject> {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const relativePath = `invoices/${Date.now()}-${randomUUID()}-${safeName}`;

  const r2 = getR2Bucket();
  if (r2) {
    await r2.put(relativePath, input.bytes, {
      httpMetadata: { contentType: input.mimeType },
    });
  } else {
    const absolutePath = path.join(uploadRoot(), relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);
  }

  return {
    url: `/api/files/${relativePath}`,
    relativePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.bytes.length,
  };
}

export async function readStoredFile(relativePath: string) {
  const r2 = getR2Bucket();
  if (r2) {
    const object = await r2.get(relativePath);
    if (!object) throw new Error("File not found");
    const buffer = Buffer.from(await object.arrayBuffer());
    return buffer;
  }

  const absolutePath = path.join(uploadRoot(), relativePath);
  return readFile(absolutePath);
}
