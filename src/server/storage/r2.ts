import { getCloudflareContext } from "@opennextjs/cloudflare";

import { contentTypeFromPath } from "./keys";
import type { StoredFileContents } from "./types";

async function getUploadsBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = env.UPLOADS;
  if (!bucket) {
    throw new Error("UPLOADS R2 binding is not configured");
  }
  return bucket;
}

export async function writeR2Object(
  relativePath: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const bucket = await getUploadsBucket();
  await bucket.put(relativePath, bytes, {
    httpMetadata: { contentType: mimeType },
  });
}

export async function readR2Object(relativePath: string): Promise<StoredFileContents> {
  const bucket = await getUploadsBucket();
  const object = await bucket.get(relativePath);
  if (!object) {
    throw new Error("File not found");
  }

  const bytes = Buffer.from(await object.arrayBuffer());
  const contentType =
    object.httpMetadata?.contentType ?? contentTypeFromPath(relativePath);

  return { bytes, contentType };
}
