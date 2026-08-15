import { assertSafeRelativePath, buildInvoiceObjectKey } from "./keys";
import type { StoredFileContents, StoredObject } from "./types";

/**
 * Invoice files are stored in Cloudflare R2 in production (Workers / OpenNext).
 * Local `./uploads` is used only for `pnpm dev` (NODE_ENV !== "production").
 */
function usesLocalDisk(): boolean {
  return process.env.NODE_ENV !== "production";
}

export type { StoredFileContents, StoredObject } from "./types";
export {
  assertSafeRelativePath,
  buildInvoiceObjectKey,
  sanitizeFileName,
} from "./keys";

export async function storeInvoiceFile(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<StoredObject> {
  const relativePath = buildInvoiceObjectKey(input.fileName);

  if (usesLocalDisk()) {
    const { writeLocalFile } = await import("./local-disk");
    await writeLocalFile(relativePath, input.bytes);
  } else {
    const { writeR2Object } = await import("./r2");
    await writeR2Object(relativePath, input.bytes, input.mimeType);
  }

  return {
    url: `/api/files/${relativePath}`,
    relativePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.bytes.length,
  };
}

export async function readStoredFile(relativePath: string): Promise<StoredFileContents> {
  assertSafeRelativePath(relativePath);

  if (usesLocalDisk()) {
    const { readLocalFile } = await import("./local-disk");
    return readLocalFile(relativePath);
  }

  const { readR2Object } = await import("./r2");
  return readR2Object(relativePath);
}
