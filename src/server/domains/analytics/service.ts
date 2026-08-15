import { prisma } from "@/server/db/prisma";
import { toNumber, startOfDay, addDays } from "@/lib/utils";
import { calculatePriorityScore, priorityHeat } from "@/server/domains/collection/priority";
import { serializeInvoice } from "@/server/domains/invoice/service";

export async function getDashboardMetrics(workspaceId: string) {
  const fresh = await prisma.invoice.findMany({
    where: { workspaceId },
    include: {
      customer: true,
      followUps: { where: { status: "SENT" }, orderBy: { sentAt: "desc" } },
      promises: { orderBy: { createdAt: "desc" } },
    },
  });

  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let outstanding = 0;
  let overdue = 0;
  let dueThisWeek = 0;
  let recoveredThisMonth = 0;

  for (const inv of fresh) {
    const amount = toNumber(inv.amountOutstanding);
    if (inv.status !== "PAID" && inv.status !== "WRITTEN_OFF") {
      outstanding += amount;
    }
    if (inv.status === "OVERDUE" || (inv.daysOverdue > 0 && amount > 0)) {
      overdue += amount;
    }
    if (
      inv.dueDate &&
      amount > 0 &&
      inv.status !== "PAID" &&
      inv.status !== "WRITTEN_OFF" &&
      startOfDay(inv.dueDate) >= today &&
      startOfDay(inv.dueDate) <= weekEnd
    ) {
      dueThisWeek += amount;
    }
    if (inv.status === "PAID" && inv.paidAt && inv.paidAt >= monthStart) {
      recoveredThisMonth += toNumber(inv.totalAmount);
    }
  }

  const chaseList = fresh
    .filter(
      (inv) =>
        inv.status !== "PAID" &&
        inv.status !== "WRITTEN_OFF" &&
        inv.status !== "DISPUTED" &&
        toNumber(inv.amountOutstanding) > 0,
    )
    .map((inv) => {
      const activePromise = inv.promises.find((p) => p.status === "ACTIVE") ?? null;
      const missedPromise = inv.promises.some((p) => p.status === "MISSED");
      const priority = calculatePriorityScore({
        amountOutstanding: toNumber(inv.amountOutstanding),
        daysOverdue: inv.daysOverdue,
        status: inv.status,
        lastFollowUpAt: inv.lastFollowUpAt,
        hasFollowUp: inv.followUps.length > 0,
        missedPromise,
        activePromise,
        customerBehavior: inv.customer?.paymentBehavior,
      });
      return {
        ...serializeInvoice(inv),
        customerName: inv.customer?.companyName || inv.customer?.name || "Unknown",
        lastFollowUpAt: inv.lastFollowUpAt,
        priorityScore: priority.score,
        priorityReasons: priority.reasons,
        heat: priorityHeat(priority.score),
        missedPromise,
        activePromise: activePromise
          ? {
              ...activePromise,
              promisedAmount: toNumber(activePromise.promisedAmount),
            }
          : null,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);

  const disputed = fresh
    .filter((inv) => inv.status === "DISPUTED")
    .map((inv) => ({
      ...serializeInvoice(inv),
      customerName: inv.customer?.companyName || inv.customer?.name || "Unknown",
    }));

  return {
    metrics: {
      outstanding,
      overdue,
      dueThisWeek,
      recoveredThisMonth,
      invoiceCount: fresh.length,
    },
    chaseList,
    disputed,
  };
}

export async function getReports(workspaceId: string) {
  const invoices = await prisma.invoice.findMany({ where: { workspaceId } });
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let outstanding = 0;
  let overdue = 0;
  let collected = 0;
  let recoveredThisMonth = 0;
  let overdueDaysSum = 0;
  let overdueCount = 0;

  const aging = {
    "1-7": 0,
    "8-14": 0,
    "15-30": 0,
    "31-60": 0,
    "60+": 0,
  };

  for (const inv of invoices) {
    const amount = toNumber(inv.amountOutstanding);
    const total = toNumber(inv.totalAmount);

    if (inv.status === "PAID") {
      collected += total;
      if (inv.paidAt && inv.paidAt >= monthStart) {
        recoveredThisMonth += total;
      }
      continue;
    }

    if (inv.status === "WRITTEN_OFF") continue;

    outstanding += amount;

    if (inv.daysOverdue > 0) {
      overdue += amount;
      overdueDaysSum += inv.daysOverdue;
      overdueCount += 1;

      if (inv.daysOverdue <= 7) aging["1-7"] += amount;
      else if (inv.daysOverdue <= 14) aging["8-14"] += amount;
      else if (inv.daysOverdue <= 30) aging["15-30"] += amount;
      else if (inv.daysOverdue <= 60) aging["31-60"] += amount;
      else aging["60+"] += amount;
    }
  }

  return {
    outstanding,
    overdue,
    collected,
    recoveredThisMonth,
    averageDaysOverdue: overdueCount ? Math.round(overdueDaysSum / overdueCount) : 0,
    aging,
  };
}
