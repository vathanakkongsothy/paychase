import type { InvoiceStatus, PromiseStatus } from "@prisma/client";
import { daysBetween, startOfDay } from "@/lib/utils";

const TERMINAL_STATUSES: InvoiceStatus[] = ["PAID", "WRITTEN_OFF", "DISPUTED"];

export type StatusInput = {
  status?: InvoiceStatus | null;
  dueDate?: Date | null;
  amountOutstanding: number;
  activePromise?: {
    promisedDate: Date;
    status: PromiseStatus;
  } | null;
  today?: Date;
};

export type StatusResult = {
  status: InvoiceStatus;
  daysOverdue: number;
};

export function calculateInvoiceStatus(input: StatusInput): StatusResult {
  const today = startOfDay(input.today ?? new Date());
  const amount = input.amountOutstanding;

  if (input.status === "PAID" || amount <= 0) {
    return { status: "PAID", daysOverdue: 0 };
  }

  if (input.status === "WRITTEN_OFF") {
    return { status: "WRITTEN_OFF", daysOverdue: 0 };
  }

  if (input.status === "DISPUTED") {
    const daysOverdue = input.dueDate
      ? Math.max(0, daysBetween(input.dueDate, today))
      : 0;
    return { status: "DISPUTED", daysOverdue };
  }

  if (
    input.activePromise &&
    input.activePromise.status === "ACTIVE" &&
    startOfDay(input.activePromise.promisedDate) >= today
  ) {
    const daysOverdue = input.dueDate
      ? Math.max(0, daysBetween(input.dueDate, today))
      : 0;
    return { status: "PROMISED", daysOverdue };
  }

  if (!input.dueDate) {
    return {
      status: input.status === "DRAFT" ? "DRAFT" : "SENT",
      daysOverdue: 0,
    };
  }

  const due = startOfDay(input.dueDate);
  const delta = daysBetween(due, today);

  if (delta > 0) {
    return { status: "OVERDUE", daysOverdue: delta };
  }

  if (delta === 0) {
    return { status: "DUE_TODAY", daysOverdue: 0 };
  }

  if (delta >= -7) {
    return { status: "DUE_SOON", daysOverdue: 0 };
  }

  return {
    status: input.status === "DRAFT" ? "DRAFT" : "SENT",
    daysOverdue: 0,
  };
}

export function isChaseable(status: InvoiceStatus) {
  return !TERMINAL_STATUSES.includes(status);
}

export function statusLabel(status: InvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "DUE_SOON":
      return "Due soon";
    case "DUE_TODAY":
      return "Due today";
    case "OVERDUE":
      return "Overdue";
    case "PROMISED":
      return "Promised";
    case "DISPUTED":
      return "Disputed";
    case "PAID":
      return "Paid";
    case "WRITTEN_OFF":
      return "Written off";
    default:
      return status;
  }
}
