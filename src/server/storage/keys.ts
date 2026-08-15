import { randomUUID } from "node:crypto";

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildInvoiceObjectKey(fileName: string, now = Date.now()): string {
  const safeName = sanitizeFileName(fileName);
  return `invoices/${now}-${randomUUID()}-${safeName}`;
}

export function assertSafeRelativePath(relativePath: string): void {
  if (
    !relativePath ||
    relativePath.includes("..") ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\")
  ) {
    throw new Error("Invalid path");
  }
}

export function contentTypeFromPath(relativePath: string): string {
  const ext = relativePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
