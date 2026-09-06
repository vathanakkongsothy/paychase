import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { batch, insert, money, one, rows, signedMoney, update, withDatabase } from "./db";
import { testDatabase } from "./test-database";
import { createUploadedInvoice, markPaid } from "./mutations";
import { changePassword } from "./auth";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { CoreSyncError } from "@/server/core/errors";
import { syncIdentityToCore } from "@/server/core/sync";
import { databaseBackend } from "./backend";
import type { Invoice, PaymentPromise, User } from "./types";
import type { StoredInvoice } from "./invoices";

vi.mock("@/server/ai/providers", () => ({
  getExtractionProvider: () => ({
    extractInvoice: vi.fn().mockResolvedValue({
      model: "test-extractor",
      data: Object.fromEntries(Object.entries({
        invoiceNumber: "uploaded", customerName: "Upload customer", customerEmail: "upload@test.invalid",
        issueDate: "2026-09-01", dueDate: "2098-01-01", currency: "USD", subtotal: 0.30,
        tax: -0.01, totalAmount: 0.29, paymentStatus: "unpaid", purchaseOrderRef: null,
      }).map(([key, value]) => [key, { value, confidence: 1 }])),
    }),
  }),
  getFollowUpProvider: () => ({
    generateReminder: vi.fn().mockResolvedValue({ subject: "Payment reminder", message: "Please pay.",
      tone: "friendly", model: "test-reminder", recommendedNextFollowUpDays: 3 }),
  }),
}));
vi.mock("@/server/storage", () => ({
  storeInvoiceFile: vi.fn().mockResolvedValue({ url: "/api/files/test.pdf", fileName: "test.pdf", mimeType: "application/pdf" }),
  readStoredFile: vi.fn().mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }),
}));
vi.mock("@/server/core/sync", () => ({
  syncIdentityToCore: vi.fn().mockResolvedValue(undefined),
  retryIdentitySyncOnLogin: vi.fn().mockResolvedValue(undefined),
  syncUserProfileToCore: vi.fn().mockResolvedValue(undefined),
}));
let db: ReturnType<typeof testDatabase>;
const now = new Date("2026-09-06T00:00:00.000Z");
const inDb = <T>(fn: () => T) => withDatabase(db.binding, fn);
async function json<T>(response: { json(): Promise<unknown> }): Promise<T> {
  return await response.json() as T;
}
async function request(path: string, method = "GET", body?: object, token = "token-a") {
  return app.fetch(new Request("http://local.test/api" + path, {
    method, headers: { cookie: "pc_session=" + token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db.binding });
}
async function invoice(invoiceId: string, workspaceId: string, units = 29n) {
  await inDb(() => batch([insert("Invoice", {
    id: invoiceId, workspaceId, customerId: workspaceId === "ws-a" ? "customer-a" : "customer-b",
    invoiceNumber: invoiceId, totalAmount: units, amountOutstanding: units, status: "OVERDUE",
    dueDate: new Date("2026-09-01T00:00:00.000Z"), daysOverdue: 5, createdAt: now, updatedAt: now,
  })]));
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.mocked(syncIdentityToCore).mockReset().mockResolvedValue(undefined);
  db = testDatabase();
  await inDb(() => batch(["a", "b"].flatMap((suffix) => [
    insert("User", { id: "user-" + suffix, email: suffix + "@test.invalid", name: suffix,
      passwordHash: "test-only", createdAt: now, updatedAt: now }),
    insert("Workspace", { id: "ws-" + suffix, name: suffix, ownerId: "user-" + suffix, createdAt: now }),
    insert("Customer", { id: "customer-" + suffix, workspaceId: "ws-" + suffix, name: suffix, createdAt: now, updatedAt: now }),
    insert("Session", { id: "session-" + suffix, userId: "user-" + suffix, token: "token-" + suffix,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"), createdAt: now }),
  ])));
});
afterEach(() => {
  db.close();
  vi.useRealTimers();
});

describe("real D1 application routes", () => {
  it("uploads, extracts, generates a reminder, adds a note, and serves the owned file through D1 routes", async () => {
    const form = new FormData();
    form.set("file", new File(["%PDF"], "test.pdf", { type: "application/pdf" }));
    const uploaded = await app.fetch(new Request("http://local.test/api/invoices/upload", {
      method: "POST", headers: { cookie: "pc_session=token-a" }, body: form,
    }), { DB: db.binding });
    expect(uploaded.status).toBe(200);
    const result = await json<{ invoices: Array<{ id: string; totalAmount: number; tax: number }> }>(uploaded);
    const invoiceId = result.invoices[0].id;
    expect(result.invoices[0].totalAmount).toBe(0.29);
    expect(result.invoices[0].tax).toBe(-0.01);
    const reminder = await request("/invoices/" + invoiceId + "/follow-ups/generate", "POST", {});
    expect(reminder.status).toBe(200);
    expect((await json<{ followUp: { status: string } }>(reminder)).followUp.status).toBe("DRAFT");
    expect((await request("/invoices/" + invoiceId + "/notes", "POST", { note: "Spoke to customer" })).status).toBe(200);
    expect((await request("/files/test.pdf")).status).toBe(200);
    expect((await request("/files/test.pdf", "GET", undefined, "token-b")).status).toBe(404);
    expect(signedMoney("-0.01")).toBe(-1n);
  });
  it("records a missed promise once under concurrent derived refreshes", async () => {
    await invoice("invoice-a", "ws-a");
    await inDb(() => batch([insert("PaymentPromise", { id: "promise-a", invoiceId: "invoice-a",
      promisedDate: new Date("2000-01-01T00:00:00.000Z"), promisedAmount: 29n,
      status: "ACTIVE", createdAt: now, updatedAt: now })]));
    const responses = await Promise.all([request("/invoices/invoice-a"), request("/invoices/invoice-a")]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(db.sqlite.prepare('SELECT "status" FROM "PaymentPromise" WHERE "id"=?').get("promise-a")!.status).toBe("MISSED");
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "InvoiceEvent" WHERE "type"=\'PROMISE_MISSED\'').get()!.n).toBe(1);
  });
  it("expires D1 sessions and isolates customer lists", async () => {
    await inDb(() => batch([update("Session", { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
      '"id"=?', ["session-b"])]));
    expect((await request("/invoices", "GET", undefined, "token-b")).status).toBe(401);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "Session" WHERE "id"=?').get("session-b")!.n).toBe(0);
    const customers = await json<Array<{ id: string }>>(await request("/customers"));
    expect(customers.map((customer: { id: string }) => customer.id)).toEqual(["customer-a"]);
  });
  it("requires an explicit backend switch and checks the runtime schema", async () => {
    expect(databaseBackend(undefined)).toBe("neon");
    expect(databaseBackend("d1")).toBe("d1");
    expect(() => databaseBackend("typo")).toThrow();
    expect((await json<{ backend: string }>(await request("/health"))).backend).toBe("d1");
    expect((await request("/invoices", "GET", undefined, "")).status).toBe(401);
  });
  it("keeps imported cents and large amounts exact and serializes nested promises", async () => {
    await invoice("invoice-a", "ws-a", money("123456789.99"));
    await inDb(() => batch([insert("PaymentPromise", { id: "promise-a", invoiceId: "invoice-a",
      promisedDate: new Date("2098-01-01T00:00:00.000Z"), promisedAmount: 29n, status: "ACTIVE", createdAt: now, updatedAt: now })]));
    const response = await request("/invoices/invoice-a");
    expect(response.status).toBe(200);
    const value = await json<{ totalAmount: number; promises: Array<{ promisedAmount: number }> }>(response);
    expect(value.totalAmount).toBe(123456789.99);
    expect(value.promises[0].promisedAmount).toBe(0.29);
    expect(value).not.toHaveProperty("d1Revision");
  });
  it("totals cents before converting dashboard and report output", async () => {
    await invoice("invoice-a", "ws-a", 10n);
    await invoice("invoice-a2", "ws-a", 20n);
    await invoice("invoice-b", "ws-b", 99999n);
    const dashboard = await json<{ metrics: { outstanding: number } }>(await request("/dashboard"));
    const reports = await json<{ outstanding: number; aging: Record<string, number> }>(await request("/reports"));
    expect(dashboard.metrics.outstanding).toBe(0.3);
    expect(reports.outstanding).toBe(0.3);
    expect(reports.aging["1-7"]).toBe(0.3);
  });
  it("atomically marks paid and keeps promises once under repeated requests", async () => {
    await invoice("invoice-a", "ws-a");
    await inDb(() => batch([insert("PaymentPromise", { id: "promise-a", invoiceId: "invoice-a",
      promisedDate: new Date("2098-01-01T00:00:00.000Z"), promisedAmount: 29n, status: "ACTIVE", createdAt: now, updatedAt: now })]));
    const responses = await Promise.all([request("/invoices/invoice-a/mark-paid", "POST"), request("/invoices/invoice-a/mark-paid", "POST")]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const paidAt = await inDb(async () => (await one<Invoice>("Invoice", 'WHERE "id"=?', ["invoice-a"]))!.paidAt);
    expect((await request("/invoices/invoice-a/mark-paid", "POST")).status).toBe(200);
    await inDb(async () => {
      const stored = (await one<Invoice>("Invoice", 'WHERE "id"=?', ["invoice-a"]))!;
      expect(stored.status).toBe("PAID");
      expect(stored.amountOutstanding).toBe(0n);
      expect(stored.paidAt).toEqual(paidAt);
      expect((await rows("InvoiceEvent", 'WHERE "invoiceId"=? AND "type"=?', ["invoice-a", "MARKED_PAID"]))).toHaveLength(1);
      expect((await one<PaymentPromise>("PaymentPromise", 'WHERE "id"=?', ["promise-a"]))!.status).toBe("KEPT");
    });
  });
  it("rolls back payment and its event if promise completion fails", async () => {
    await invoice("invoice-a", "ws-a");
    await inDb(() => batch([insert("PaymentPromise", { id: "promise-a", invoiceId: "invoice-a",
      promisedDate: now, promisedAmount: 29n, status: "ACTIVE", createdAt: now, updatedAt: now })]));
    db.sqlite.exec('CREATE TRIGGER reject_payment BEFORE UPDATE ON "PaymentPromise" BEGIN SELECT RAISE(ABORT, \'injected failure\'); END;');
    await expect(inDb(() => markPaid("invoice-a", "ws-a"))).rejects.toThrow();
    expect(db.sqlite.prepare('SELECT "status" FROM "Invoice" WHERE "id"=?').get("invoice-a")!.status).toBe("OVERDUE");
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "InvoiceEvent"').get()!.n).toBe(0);
  });
  it("rejects cross-tenant invoice and follow-up mutations", async () => {
    await invoice("invoice-a", "ws-a"); await invoice("invoice-b", "ws-b");
    await inDb(() => batch([insert("FollowUp", { id: "follow-b", invoiceId: "invoice-b", type: "REMINDER",
      message: "private", status: "DRAFT", createdAt: now })]));
    expect((await request("/invoices/invoice-b/mark-paid", "POST")).status).toBe(404);
    expect((await request("/invoices/invoice-a/follow-ups/follow-b/sent", "POST", {})).status).toBe(409);
    expect(db.sqlite.prepare('SELECT "status" FROM "FollowUp" WHERE "id"=?').get("follow-b")!.status).toBe("DRAFT");
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "InvoiceEvent"').get()!.n).toBe(0);
  });
  it("records sent follow-ups only once", async () => {
    await invoice("invoice-a", "ws-a");
    await inDb(() => batch([insert("FollowUp", { id: "follow-a", invoiceId: "invoice-a", type: "REMINDER",
      message: "hello", status: "DRAFT", createdAt: now })]));
    for (let index = 0; index < 2; index++)
      expect((await request("/invoices/invoice-a/follow-ups/follow-a/sent", "POST", {})).status).toBe(200);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "InvoiceEvent" WHERE "type"=\'REMINDER_SENT\'').get()!.n).toBe(1);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "InvoiceEvent" WHERE "type"=\'FOLLOW_UP_SCHEDULED\'').get()!.n).toBe(1);
  });
  it("serializes competing promises and never reopens paid invoices", async () => {
    await invoice("invoice-a", "ws-a");
    const body = { promisedDate: "2098-01-01", promisedAmount: "0.29" };
    const replies = await Promise.all([request("/invoices/invoice-a/promise", "POST", body), request("/invoices/invoice-a/promise", "POST", body)]);
    expect(replies.map((response) => response.status)).toEqual([200, 200]);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "PaymentPromise" WHERE "status"=\'ACTIVE\'').get()!.n).toBe(1);
    await request("/invoices/invoice-a/mark-paid", "POST");
    expect((await request("/invoices/invoice-a/promise", "POST", body)).status).toBe(409);
  });
  it("rejects fractional-cent corrections without changing customer or invoice", async () => {
    await invoice("invoice-a", "ws-a");
    const response = await request("/invoices/invoice-a/correct", "PATCH", {
      invoiceNumber: "new-number", customerName: "changed", totalAmount: "0.291", amountOutstanding: "0.29",
    });
    expect(response.status).toBe(400);
    expect(db.sqlite.prepare('SELECT "name" FROM "Customer" WHERE "id"=?').get("customer-a")!.name).toBe("a");
    expect(db.sqlite.prepare('SELECT "totalAmount" FROM "Invoice" WHERE "id"=?').get("invoice-a")!.totalAmount).toBe(29);
  });
  it("commits corrections with customer and audit event together", async () => {
    await invoice("invoice-a", "ws-a");
    const response = await request("/invoices/invoice-a/correct", "PATCH", {
      invoiceNumber: "corrected", customerName: "Corrected customer", totalAmount: "10.01", amountOutstanding: "10.01",
    });
    expect(response.status).toBe(200);
    expect((await json<{ amountOutstanding: number }>(response)).amountOutstanding).toBe(10.01);
    expect(db.sqlite.prepare('SELECT "totalAmount" FROM "Invoice" WHERE "id"=?').get("invoice-a")!.totalAmount).toBe(1001);
    expect(db.sqlite.prepare('SELECT "name" FROM "Customer" WHERE "id"=?').get("customer-a")!.name).toBe("Corrected customer");
  });
  it("rolls back every nested upload write when extraction insertion fails", async () => {
    db.sqlite.exec('CREATE TRIGGER reject_extraction BEFORE INSERT ON "InvoiceExtraction" BEGIN SELECT RAISE(ABORT, \'injected failure\'); END;');
    await expect(inDb(() => createUploadedInvoice({
      workspaceId: "ws-a", customer: { name: "new customer", email: null },
      invoice: { invoiceNumber: "test-upload", totalAmount: 29n, amountOutstanding: 29n, status: "SENT" },
      extraction: { extractedData: {}, confidenceData: {}, model: "test" },
    }))).rejects.toThrow();
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "Invoice"').get()!.n).toBe(0);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "Customer"').get()!.n).toBe(2);
  });
  it("prevents a stale derived refresh from undoing payment even with equal timestamps", async () => {
    await invoice("invoice-a", "ws-a");
    await inDb(async () => {
      const stale = (await one<StoredInvoice>("Invoice", 'WHERE "id"=?', ["invoice-a"]))!;
      await markPaid("invoice-a", "ws-a");
      await batch([update("Invoice", { status: "OVERDUE", updatedAt: now },
        '"id"=? AND "d1Revision"=?', ["invoice-a", stale.d1Revision])]);
      expect((await one<Invoice>("Invoice", 'WHERE "id"=?', ["invoice-a"]))!.status).toBe("PAID");
    });
  });
  it("signs up and logs in using D1 and compensates a failed Core sync", async () => {
    const signup = await request("/auth/signup", "POST", { email: "new@test.invalid", name: "New", password: "password123" });
    expect(signup.status).toBe(200);
    expect(signup.headers.get("set-cookie")).toContain("pc_session=");
    expect((await request("/auth/login", "POST", { email: "new@test.invalid", password: "password123" })).status).toBe(200);
    vi.mocked(syncIdentityToCore).mockRejectedValueOnce(new CoreSyncError("sync failed"));
    expect((await request("/auth/signup", "POST", { email: "failed@test.invalid", name: "Failed", password: "password123" })).status).toBe(503);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "User" WHERE "email"=?').get("failed@test.invalid")!.n).toBe(0);
    expect(db.sqlite.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
  });
  it("changes password and revokes sessions atomically", async () => {
    const passwordHash = await hashPassword("old-password");
    await inDb(() => batch([update("User", { passwordHash }, '"id"=?', ["user-a"])]));
    db.sqlite.exec('CREATE TRIGGER reject_session_delete BEFORE DELETE ON "Session" BEGIN SELECT RAISE(ABORT, \'injected failure\'); END;');
    await expect(inDb(() => changePassword("user-a", { currentPassword: "old-password", newPassword: "new-password" }))).rejects.toThrow();
    expect(db.sqlite.prepare('SELECT "passwordHash" FROM "User" WHERE "id"=?').get("user-a")!.passwordHash).toBe(passwordHash);
    db.sqlite.exec("DROP TRIGGER reject_session_delete");
    await inDb(() => changePassword("user-a", { currentPassword: "old-password", newPassword: "new-password" }));
    const stored = await inDb(() => one<User>("User", 'WHERE "id"=?', ["user-a"]));
    expect(await verifyPassword("new-password", stored!.passwordHash)).toBe(true);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM "Session" WHERE "userId"=?').get("user-a")!.n).toBe(0);
  });
});
