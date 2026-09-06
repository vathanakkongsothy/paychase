import type { Customer, Invoice, InvoiceEvent, InvoiceExtraction, FollowUp, PaymentPromise, PaymentBehavior, Workspace } from "./types";
import { amount, batch, id, one, rows, statement, update, DataError } from "./db";
import { calculateInvoiceStatus } from "@/server/domains/collection/status";
import { calculatePriorityScore } from "@/server/domains/collection/priority";
import { startOfDay } from "@/lib/utils";

export type StoredInvoice = Invoice & { d1Revision: number };
export type InvoiceDetail = StoredInvoice & {
  customer: Customer | null; followUps: FollowUp[]; promises: PaymentPromise[];
  events: InvoiceEvent[]; extractions: InvoiceExtraction[];
};
export async function getWorkspaceForUser(userId: string) {
  const workspace = await one<Workspace>("Workspace", 'WHERE "ownerId"=? ORDER BY "createdAt", "id"', [userId]);
  if (!workspace) throw new DataError("No workspace found for this account.", 404);
  return workspace;
}
export async function getInvoiceInWorkspace(invoiceId: string, workspaceId: string) {
  const invoice = await one<StoredInvoice>("Invoice", 'WHERE "id"=? AND "workspaceId"=?', [invoiceId, workspaceId]);
  if (!invoice) throw new DataError("Invoice not found", 404);
  return invoice;
}
export async function invoiceDetails(invoiceId: string, workspaceId: string): Promise<InvoiceDetail> {
  const invoice = await getInvoiceInWorkspace(invoiceId, workspaceId);
  const [customer, followUps, promises, events, extractions] = await Promise.all([
    invoice.customerId ? one<Customer>("Customer", 'WHERE "id"=? AND "workspaceId"=?', [invoice.customerId, workspaceId]) : null,
    rows<FollowUp>("FollowUp", 'WHERE "invoiceId"=? ORDER BY "createdAt" DESC, "id"', [invoiceId]),
    rows<PaymentPromise>("PaymentPromise", 'WHERE "invoiceId"=? ORDER BY "createdAt" DESC, "id"', [invoiceId]),
    rows<InvoiceEvent>("InvoiceEvent", 'WHERE "invoiceId"=? ORDER BY "createdAt" DESC, "id"', [invoiceId]),
    rows<InvoiceExtraction>("InvoiceExtraction", 'WHERE "invoiceId"=? ORDER BY "createdAt" DESC, "id" LIMIT 1', [invoiceId]),
  ]);
  return { ...invoice, customer, followUps, promises, events, extractions };
}
export async function workspaceInvoices(workspaceId: string) {
  const [invoices, customers, followUps, promises] = await Promise.all([
    rows<Invoice>("Invoice", 'WHERE "workspaceId"=? ORDER BY "priorityScore" DESC, "dueDate", "id"', [workspaceId]),
    rows<Customer>("Customer", 'WHERE "workspaceId"=?', [workspaceId]),
    rows<FollowUp>("FollowUp", 'WHERE "invoiceId" IN (SELECT "id" FROM "Invoice" WHERE "workspaceId"=?) ORDER BY "createdAt" DESC, "id"', [workspaceId]),
    rows<PaymentPromise>("PaymentPromise", 'WHERE "invoiceId" IN (SELECT "id" FROM "Invoice" WHERE "workspaceId"=?) ORDER BY "createdAt" DESC, "id"', [workspaceId]),
  ]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  return invoices.map((invoice) => ({
    ...invoice, customer: invoice.customerId ? customerMap.get(invoice.customerId) ?? null : null,
    followUps: followUps.filter((followUp) => followUp.invoiceId === invoice.id),
    promises: promises.filter((promise) => promise.invoiceId === invoice.id),
  }));
}
export async function refreshInvoiceDerivedFields(invoiceId: string, workspaceId: string) {
  const invoice = await invoiceDetails(invoiceId, workspaceId);
  const today = startOfDay(new Date());
  const overduePromises = invoice.promises.filter((promise) =>
    promise.status === "ACTIVE" && startOfDay(promise.promisedDate) < today);
  for (const promise of overduePromises) {
    const eventId = id();
    await batch([
      statement(
        'INSERT INTO "InvoiceEvent" ("id","invoiceId","type","metadata","createdAt") ' +
        'SELECT ?,i."id",\'PROMISE_MISSED\',?,? FROM "Invoice" i JOIN "PaymentPromise" p ON p."invoiceId"=i."id" ' +
        'WHERE i."id"=? AND i."workspaceId"=? AND i."amountOutstanding">0 AND i."status"<>\'PAID\' ' +
        'AND p."id"=? AND p."status"=\'ACTIVE\' AND p."promisedDate"<?',
        [eventId, { promisedDate: promise.promisedDate.toISOString(), promisedAmount: amount(promise.promisedAmount) },
          new Date(), invoiceId, workspaceId, promise.id, today]),
      update("PaymentPromise", { status: "MISSED", updatedAt: new Date() },
        '"id"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)', [promise.id, eventId]),
      update("Invoice", { updatedAt: new Date() },
        '"id"=? AND "workspaceId"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)',
        [invoiceId, workspaceId, eventId]),
    ]);
  }
  const fresh = await invoiceDetails(invoiceId, workspaceId);
  const activePromise = fresh.promises.find((promise) => promise.status === "ACTIVE") ?? null;
  const status = calculateInvoiceStatus({ status: fresh.status, dueDate: fresh.dueDate,
    amountOutstanding: amount(fresh.amountOutstanding), activePromise });
  const priority = calculatePriorityScore({
    amountOutstanding: amount(fresh.amountOutstanding), daysOverdue: status.daysOverdue,
    status: status.status, lastFollowUpAt: fresh.lastFollowUpAt,
    hasFollowUp: fresh.followUps.some((followUp) => followUp.status === "SENT"),
    missedPromise: fresh.promises.some((promise) => promise.status === "MISSED"),
    activePromise, customerBehavior: fresh.customer?.paymentBehavior,
  });
  await batch([update("Invoice", { status: status.status, daysOverdue: status.daysOverdue,
    priorityScore: priority.score, updatedAt: new Date() },
    '"id"=? AND "workspaceId"=? AND "d1Revision"=?',
    [invoiceId, workspaceId, fresh.d1Revision])]);
  return invoiceDetails(invoiceId, workspaceId);
}
export function inferPaymentBehavior(
  invoices: Array<Pick<Invoice, "status" | "daysOverdue" | "paidAt" | "dueDate">>,
): PaymentBehavior {
  const closed = invoices.filter((invoice) => invoice.status === "PAID" || invoice.paidAt);
  if (closed.length < 2) return "UNKNOWN";
  const late = closed.filter((invoice) => invoice.daysOverdue > 0 ||
    (invoice.dueDate && invoice.paidAt && invoice.paidAt > invoice.dueDate)).length / closed.length;
  return late >= 0.6 ? "FREQUENTLY_LATE" : late >= 0.25 ? "SOMETIMES_LATE" : "USUALLY_ON_TIME";
}
type Serialized<T> = T extends bigint ? number : T extends Date ? Date :
  T extends Array<infer U> ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export function serialize<T>(value: T): Serialized<T> {
  if (typeof value === "bigint") return amount(value) as Serialized<T>;
  if (Array.isArray(value)) return value.map(serialize) as Serialized<T>;
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "d1Revision").map(([key, child]) => [key, serialize(child)])) as Serialized<T>;
  return value as Serialized<T>;
}
export const serializeInvoice = serialize;
export const serializePromise = serialize;
