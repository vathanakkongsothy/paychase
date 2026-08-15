import type { Invoice, PaymentBehavior, PaymentPromise } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { calculateInvoiceStatus } from "@/server/domains/collection/status";
import { calculatePriorityScore } from "@/server/domains/collection/priority";
import { startOfDay, toNumber } from "@/lib/utils";

export async function getWorkspaceForUser(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    include: { owner: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    throw new Error("No workspace found for this account.");
  }
  return workspace;
}

export async function getInvoiceInWorkspace(invoiceId: string, workspaceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
  });
  if (!invoice) {
    const error = new Error("Invoice not found") as Error & { status: number };
    error.status = 404;
    throw error;
  }
  return invoice;
}

export async function refreshInvoiceDerivedFields(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      customer: true,
      followUps: { where: { status: "SENT" }, orderBy: { sentAt: "desc" } },
      promises: { orderBy: { createdAt: "desc" } },
    },
  });

  const activePromise =
    invoice.promises.find((p) => p.status === "ACTIVE") ?? null;
  const missedPromise = invoice.promises.some((p) => p.status === "MISSED");

  // Mark overdue active promises as missed
  const today = startOfDay(new Date());
  for (const promise of invoice.promises) {
    if (
      promise.status === "ACTIVE" &&
      startOfDay(promise.promisedDate) < today &&
      toNumber(invoice.amountOutstanding) > 0 &&
      invoice.status !== "PAID"
    ) {
      await prisma.paymentPromise.update({
        where: { id: promise.id },
        data: { status: "MISSED" },
      });
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          type: "PROMISE_MISSED",
          metadata: {
            promisedDate: promise.promisedDate.toISOString(),
            promisedAmount: toNumber(promise.promisedAmount),
          },
        },
      });
    }
  }

  const refreshedPromises = await prisma.paymentPromise.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  });
  const currentActive =
    refreshedPromises.find((p) => p.status === "ACTIVE") ?? null;
  const hasMissed = refreshedPromises.some((p) => p.status === "MISSED");

  const statusResult = calculateInvoiceStatus({
    status: invoice.status,
    dueDate: invoice.dueDate,
    amountOutstanding: toNumber(invoice.amountOutstanding),
    activePromise: currentActive,
  });

  const priority = calculatePriorityScore({
    amountOutstanding: toNumber(invoice.amountOutstanding),
    daysOverdue: statusResult.daysOverdue,
    status: statusResult.status,
    lastFollowUpAt: invoice.lastFollowUpAt,
    hasFollowUp: invoice.followUps.length > 0,
    missedPromise: hasMissed,
    activePromise: currentActive,
    customerBehavior: invoice.customer?.paymentBehavior,
  });

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: statusResult.status,
      daysOverdue: statusResult.daysOverdue,
      priorityScore: priority.score,
    },
    include: {
      customer: true,
      followUps: { orderBy: { createdAt: "desc" } },
      promises: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" } },
      extractions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function refreshWorkspaceInvoices(workspaceId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  for (const invoice of invoices) {
    await refreshInvoiceDerivedFields(invoice.id);
  }
}

export function inferPaymentBehavior(
  invoices: Array<Pick<Invoice, "status" | "daysOverdue" | "paidAt" | "dueDate">>,
): PaymentBehavior {
  const closed = invoices.filter((i) => i.status === "PAID" || i.paidAt);
  if (closed.length < 2) return "UNKNOWN";

  let lateCount = 0;
  for (const inv of closed) {
    if (inv.daysOverdue > 0) lateCount += 1;
    else if (inv.dueDate && inv.paidAt && inv.paidAt > inv.dueDate) lateCount += 1;
  }

  const ratio = lateCount / closed.length;
  if (ratio >= 0.6) return "FREQUENTLY_LATE";
  if (ratio >= 0.25) return "SOMETIMES_LATE";
  return "USUALLY_ON_TIME";
}

export function serializeInvoice<T extends Invoice>(invoice: T) {
  return {
    ...invoice,
    totalAmount: toNumber(invoice.totalAmount),
    amountOutstanding: toNumber(invoice.amountOutstanding),
    subtotal: invoice.subtotal == null ? null : toNumber(invoice.subtotal),
    tax: invoice.tax == null ? null : toNumber(invoice.tax),
  };
}

export function serializePromise(promise: PaymentPromise) {
  return {
    ...promise,
    promisedAmount: toNumber(promise.promisedAmount),
  };
}
