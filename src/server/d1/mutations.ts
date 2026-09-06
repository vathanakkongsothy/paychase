import type { Customer, Invoice, InvoiceExtraction, FollowUp, FollowUpTone, PaymentPromise } from "./types";
import { amount, batch, DataError, guard, id, insert, money, one, optionalMoney, statement, update } from "./db";
import { getInvoiceInWorkspace, invoiceDetails } from "./invoices";

function event(invoiceId: string, type: string, metadata?: object) {
  return insert("InvoiceEvent", { id: id(), invoiceId, type, metadata, createdAt: new Date() });
}
function nextTime(previous: Date) { return new Date(Math.max(Date.now(), previous.getTime() + 1)); }
function ownsInvoice(invoiceId: string, workspaceId: string) {
  return guard('EXISTS (SELECT 1 FROM "Invoice" WHERE "id"=? AND "workspaceId"=?)', [invoiceId, workspaceId]);
}
export async function createUploadedInvoice(input: {
  workspaceId: string;
  customer: { name: string; email: string | null };
  invoice: Omit<Partial<Invoice>, "id" | "workspaceId" | "customerId"> & {
    invoiceNumber: string; totalAmount: bigint; amountOutstanding: bigint;
  };
  extraction: Pick<InvoiceExtraction, "extractedData" | "confidenceData" | "model">;
}) {
  const invoiceId = id();
  const now = new Date();
  const existing = await one<Customer>("Customer",
    'WHERE "workspaceId"=? AND ("name"=? OR "companyName"=?) ORDER BY "id"',
    [input.workspaceId, input.customer.name, input.customer.name]);
  const customerId = existing?.id ?? id();
  const statements: D1PreparedStatement[] = [];
  if (!existing) statements.push(insert("Customer", { id: customerId, workspaceId: input.workspaceId,
    name: input.customer.name, companyName: input.customer.name, email: input.customer.email,
    paymentBehavior: "UNKNOWN", createdAt: now, updatedAt: now }));
  statements.push(
    guard('EXISTS (SELECT 1 FROM "Customer" WHERE "id"=? AND "workspaceId"=?)', [customerId, input.workspaceId]),
    insert("Invoice", { ...input.invoice, id: invoiceId, workspaceId: input.workspaceId, customerId,
      createdAt: now, updatedAt: now }),
    insert("InvoiceExtraction", { ...input.extraction, id: id(), invoiceId, createdAt: now }),
    event(invoiceId, "INVOICE_UPLOADED", { fileName: input.invoice.sourceFileName }),
    event(invoiceId, "INVOICE_EXTRACTED", { model: input.extraction.model }),
  );
  await batch(statements);
  return invoiceDetails(invoiceId, input.workspaceId);
}
export type Correction = {
  invoiceNumber: string; customerName: string; customerEmail?: string | null;
  issueDate?: string | null; dueDate?: string | null; currency: string;
  subtotal?: number | string | null; tax?: number | string | null;
  totalAmount: number | string; amountOutstanding: number | string;
  purchaseOrderRef?: string | null; notes?: string | null;
};
export async function correctInvoice(invoiceId: string, workspaceId: string, input: Correction) {
  const invoice = await getInvoiceInWorkspace(invoiceId, workspaceId);
  const totalAmount = money(input.totalAmount);
  const amountOutstanding = money(input.amountOutstanding);
  if (amountOutstanding > totalAmount || (invoice.status === "PAID" && amountOutstanding !== 0n))
    throw new DataError("Outstanding amount must not exceed the total or reopen a paid invoice.");
  const statements = [
    guard('EXISTS (SELECT 1 FROM "Invoice" WHERE "id"=? AND "workspaceId"=? AND "d1Revision"=?)',
      [invoiceId, workspaceId, invoice.d1Revision]),
  ];
  if (invoice.customerId) statements.push(
    guard('EXISTS (SELECT 1 FROM "Customer" WHERE "id"=? AND "workspaceId"=?)', [invoice.customerId, workspaceId]),
    update("Customer", { name: input.customerName, companyName: input.customerName,
      email: input.customerEmail, updatedAt: new Date() }, '"id"=? AND "workspaceId"=?', [invoice.customerId, workspaceId]),
  );
  statements.push(update("Invoice", {
    invoiceNumber: input.invoiceNumber, issueDate: input.issueDate ? new Date(input.issueDate) : null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null, currency: input.currency,
    subtotal: optionalMoney(input.subtotal), tax: optionalMoney(input.tax), totalAmount, amountOutstanding,
    purchaseOrderRef: input.purchaseOrderRef, notes: input.notes, updatedAt: nextTime(invoice.updatedAt),
  }, '"id"=? AND "workspaceId"=?', [invoiceId, workspaceId]),
  event(invoiceId, "INVOICE_CORRECTED", { fields: Object.keys(input) }));
  await batch(statements);
}
export async function createReminder(invoiceId: string, workspaceId: string, input: {
  tone: FollowUpTone; subject: string; message: string; model: string; originalTone: string;
}) {
  const followUpId = id();
  await batch([ownsInvoice(invoiceId, workspaceId),
    insert("FollowUp", { id: followUpId, invoiceId, type: "REMINDER", tone: input.tone,
      subject: input.subject, message: input.message, status: "DRAFT", createdAt: new Date() }),
    event(invoiceId, "REMINDER_GENERATED", { followUpId, tone: input.originalTone, model: input.model })]);
  return one<FollowUp>("FollowUp", 'WHERE "id"=? AND "invoiceId"=?', [followUpId, invoiceId]);
}
export async function markReminderSent(invoiceId: string, workspaceId: string, followUpId: string, days: number) {
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new DataError("Follow-up days must be between 0 and 365.");
  const now = new Date();
  const nextFollowUpAt = new Date(now.getTime() + days * 86400000);
  const eventId = id();
  await batch([
    ownsInvoice(invoiceId, workspaceId),
    guard('EXISTS (SELECT 1 FROM "FollowUp" WHERE "id"=? AND "invoiceId"=? AND "status" IN (\'DRAFT\',\'SENT\'))',
      [followUpId, invoiceId]),
    statement('INSERT INTO "InvoiceEvent" ("id","invoiceId","type","metadata","createdAt") ' +
      'SELECT ?,"invoiceId",\'REMINDER_SENT\',?,? FROM "FollowUp" WHERE "id"=? AND "invoiceId"=? AND "status"=\'DRAFT\'',
      [eventId, { followUpId }, now, followUpId, invoiceId]),
    statement('INSERT INTO "InvoiceEvent" ("id","invoiceId","type","metadata","createdAt") ' +
      'SELECT ?,?,\'FOLLOW_UP_SCHEDULED\',?,? WHERE EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)',
      [id(), invoiceId, { nextFollowUpAt: nextFollowUpAt.toISOString() }, now, eventId]),
    update("FollowUp", { status: "SENT", sentAt: now },
      '"id"=? AND "invoiceId"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)', [followUpId, invoiceId, eventId]),
    update("Invoice", { lastFollowUpAt: now, nextFollowUpAt, updatedAt: now },
      '"id"=? AND "workspaceId"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)', [invoiceId, workspaceId, eventId]),
  ]);
  return one<FollowUp>("FollowUp", 'WHERE "id"=? AND "invoiceId"=?', [followUpId, invoiceId]);
}
export async function addNote(invoiceId: string, workspaceId: string, note: string) {
  const followUpId = id();
  const now = new Date();
  await batch([ownsInvoice(invoiceId, workspaceId),
    insert("FollowUp", { id: followUpId, invoiceId, type: "NOTE", message: note, status: "SENT", sentAt: now, createdAt: now }),
    update("Invoice", { notes: note, updatedAt: now }, '"id"=? AND "workspaceId"=?', [invoiceId, workspaceId]),
    event(invoiceId, "NOTE_ADDED", { note })]);
  return one<FollowUp>("FollowUp", 'WHERE "id"=? AND "invoiceId"=?', [followUpId, invoiceId]);
}
export async function recordPromise(invoiceId: string, workspaceId: string, input: {
  promisedDate: string; promisedAmount: string | number; notes?: string;
}) {
  const promisedAmount = money(input.promisedAmount);
  if (promisedAmount === 0n) throw new DataError("Promised amount must be positive.");
  const promisedDate = new Date(input.promisedDate);
  const promiseId = id();
  const now = new Date();
  await batch([
    guard('EXISTS (SELECT 1 FROM "Invoice" WHERE "id"=? AND "workspaceId"=? AND "status" NOT IN (\'PAID\',\'WRITTEN_OFF\'))',
      [invoiceId, workspaceId]),
    update("PaymentPromise", { status: "CANCELLED", updatedAt: now }, '"invoiceId"=? AND "status"=\'ACTIVE\'', [invoiceId]),
    insert("PaymentPromise", { id: promiseId, invoiceId, promisedDate, promisedAmount,
      status: "ACTIVE", notes: input.notes, createdAt: now, updatedAt: now }),
    update("Invoice", { status: "PROMISED", updatedAt: now }, '"id"=? AND "workspaceId"=?', [invoiceId, workspaceId]),
    event(invoiceId, "PROMISE_RECORDED", { promisedDate: promisedDate.toISOString(), promisedAmount: amount(promisedAmount) }),
  ]);
  return one<PaymentPromise>("PaymentPromise", 'WHERE "id"=? AND "invoiceId"=?', [promiseId, invoiceId]);
}
export async function markDisputed(invoiceId: string, workspaceId: string) {
  const eventId = id();
  const now = new Date();
  await batch([
    guard('EXISTS (SELECT 1 FROM "Invoice" WHERE "id"=? AND "workspaceId"=? AND "status" NOT IN (\'PAID\',\'WRITTEN_OFF\'))',
      [invoiceId, workspaceId]),
    statement('INSERT INTO "InvoiceEvent" ("id","invoiceId","type","createdAt") SELECT ?,"id",\'MARKED_DISPUTED\',? ' +
      'FROM "Invoice" WHERE "id"=? AND "workspaceId"=? AND "status"<>\'DISPUTED\'', [eventId, now, invoiceId, workspaceId]),
    update("Invoice", { status: "DISPUTED", updatedAt: now },
      '"id"=? AND "workspaceId"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)', [invoiceId, workspaceId, eventId]),
  ]);
}
export async function markPaid(invoiceId: string, workspaceId: string) {
  const eventId = id();
  const now = new Date();
  await batch([
    ownsInvoice(invoiceId, workspaceId),
    statement('INSERT INTO "InvoiceEvent" ("id","invoiceId","type","createdAt") SELECT ?,"id",\'MARKED_PAID\',? ' +
      'FROM "Invoice" WHERE "id"=? AND "workspaceId"=? AND "status"<>\'PAID\'', [eventId, now, invoiceId, workspaceId]),
    update("Invoice", { status: "PAID", amountOutstanding: 0n, paidAt: now,
      daysOverdue: 0, priorityScore: 0, updatedAt: now },
      '"id"=? AND "workspaceId"=? AND EXISTS (SELECT 1 FROM "InvoiceEvent" WHERE "id"=?)', [invoiceId, workspaceId, eventId]),
    update("PaymentPromise", { status: "KEPT", updatedAt: now }, '"invoiceId"=? AND "status"=\'ACTIVE\'', [invoiceId]),
  ]);
}
