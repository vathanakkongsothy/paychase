import { addDays, startOfDay } from "@/lib/utils";
import { calculatePriorityScore, priorityHeat } from "@/server/domains/collection/priority";
import { amount } from "./db";
import { serializeInvoice, workspaceInvoices } from "./invoices";

export async function getDashboardMetrics(workspaceId: string) {
  const invoices = await workspaceInvoices(workspaceId);
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let outstanding = 0n, overdue = 0n, dueThisWeek = 0n, recoveredThisMonth = 0n;
  for (const invoice of invoices) {
    const open = invoice.status !== "PAID" && invoice.status !== "WRITTEN_OFF";
    if (open) outstanding += invoice.amountOutstanding;
    if (open && (invoice.status === "OVERDUE" || invoice.daysOverdue > 0)) overdue += invoice.amountOutstanding;
    if (open && invoice.dueDate && startOfDay(invoice.dueDate) >= today &&
      startOfDay(invoice.dueDate) <= weekEnd) dueThisWeek += invoice.amountOutstanding;
    if (invoice.status === "PAID" && invoice.paidAt && invoice.paidAt >= monthStart)
      recoveredThisMonth += invoice.totalAmount;
  }
  const chaseList = invoices.filter((invoice) =>
    !["PAID", "WRITTEN_OFF", "DISPUTED"].includes(invoice.status) && invoice.amountOutstanding > 0n
  ).map((invoice) => {
    const activePromise = invoice.promises.find((promise) => promise.status === "ACTIVE") ?? null;
    const missedPromise = invoice.promises.some((promise) => promise.status === "MISSED");
    const priority = calculatePriorityScore({
      amountOutstanding: amount(invoice.amountOutstanding), daysOverdue: invoice.daysOverdue,
      status: invoice.status, lastFollowUpAt: invoice.lastFollowUpAt,
      hasFollowUp: invoice.followUps.some((followUp) => followUp.status === "SENT"),
      missedPromise, activePromise, customerBehavior: invoice.customer?.paymentBehavior,
    });
    return {
      ...serializeInvoice(invoice),
      customerName: invoice.customer?.companyName || invoice.customer?.name || "Unknown",
      priorityScore: priority.score, priorityReasons: priority.reasons, heat: priorityHeat(priority.score),
      missedPromise, activePromise: activePromise ? { ...activePromise, promisedAmount: amount(activePromise.promisedAmount) } : null,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 12);
  const disputed = invoices.filter((invoice) => invoice.status === "DISPUTED").map((invoice) => ({
    ...serializeInvoice(invoice), customerName: invoice.customer?.companyName || invoice.customer?.name || "Unknown",
  }));
  return {
    metrics: { outstanding: amount(outstanding), overdue: amount(overdue), dueThisWeek: amount(dueThisWeek),
      recoveredThisMonth: amount(recoveredThisMonth), invoiceCount: invoices.length },
    chaseList, disputed,
  };
}
export async function getReports(workspaceId: string) {
  const invoices = await workspaceInvoices(workspaceId);
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let outstanding = 0n, overdue = 0n, collected = 0n, recoveredThisMonth = 0n;
  let overdueDaysSum = 0, overdueCount = 0;
  const aging: Record<string, bigint> = { "1-7": 0n, "8-14": 0n, "15-30": 0n, "31-60": 0n, "60+": 0n };
  for (const invoice of invoices) {
    if (invoice.status === "PAID") {
      collected += invoice.totalAmount;
      if (invoice.paidAt && invoice.paidAt >= monthStart) recoveredThisMonth += invoice.totalAmount;
      continue;
    }
    if (invoice.status === "WRITTEN_OFF") continue;
    outstanding += invoice.amountOutstanding;
    if (invoice.daysOverdue > 0) {
      overdue += invoice.amountOutstanding;
      overdueDaysSum += invoice.daysOverdue;
      overdueCount++;
      const bucket = invoice.daysOverdue <= 7 ? "1-7" : invoice.daysOverdue <= 14 ? "8-14" :
        invoice.daysOverdue <= 30 ? "15-30" : invoice.daysOverdue <= 60 ? "31-60" : "60+";
      aging[bucket] += invoice.amountOutstanding;
    }
  }
  return {
    outstanding: amount(outstanding), overdue: amount(overdue), collected: amount(collected),
    recoveredThisMonth: amount(recoveredThisMonth),
    averageDaysOverdue: overdueCount ? Math.round(overdueDaysSum / overdueCount) : 0,
    aging: Object.fromEntries(Object.entries(aging).map(([key, value]) => [key, amount(value)])),
  };
}
