import { describe, expect, it } from "vitest";

import {
  assertSafeRelativePath,
  buildInvoiceObjectKey,
  sanitizeFileName,
} from "@/server/storage/keys";

describe("invoice storage keys", () => {
  it("sanitizes unsafe characters in file names", () => {
    expect(sanitizeFileName("invoice (1).pdf")).toBe("invoice__1_.pdf");
    expect(sanitizeFileName("café-facture#2.png")).toBe("caf_-facture_2.png");
  });

  it("builds object keys under invoices/ with a sanitized suffix", () => {
    const key = buildInvoiceObjectKey("My Invoice.PDF", 1_700_000_000_000);
    expect(key).toMatch(/^invoices\/1700000000000-[0-9a-f-]{36}-My_Invoice\.PDF$/);
  });

  it("rejects path traversal and absolute paths", () => {
    expect(() => assertSafeRelativePath("../etc/passwd")).toThrow("Invalid path");
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow("Invalid path");
    expect(() => assertSafeRelativePath("invoices\\secret.pdf")).toThrow("Invalid path");
    expect(() => assertSafeRelativePath("")).toThrow("Invalid path");
  });

  it("allows normal invoice object keys", () => {
    expect(() =>
      assertSafeRelativePath("invoices/1700000000000-uuid-invoice.pdf"),
    ).not.toThrow();
  });
});
