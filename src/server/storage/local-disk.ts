import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { contentTypeFromPath } from "./keys";
import type { StoredFileContents } from "./types";

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || "./uploads");
}

export async function writeLocalFile(relativePath: string, bytes: Buffer): Promise<void> {
  const absolutePath = path.join(uploadRoot(), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
}

export async function readLocalFile(relativePath: string): Promise<StoredFileContents> {
  const absolutePath = path.join(uploadRoot(), relativePath);
  const bytes = await readFile(absolutePath);
  return {
    bytes,
    contentType: contentTypeFromPath(relativePath),
  };
}
