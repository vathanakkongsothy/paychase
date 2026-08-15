import type { InvoiceStatus, PaymentBehavior, PromiseStatus } from "@prisma/client";
import { daysBetween, startOfDay } from "@/lib/utils";

export type PriorityInput = {
  amountOutstanding: number;
  daysOverdue: number;
  status: InvoiceStatus;
  lastFollowUpAt?: Date | null;
  hasFollowUp: boolean;
  missedPromise: boolean;
  activePromise?: {
    promisedDate: Date;
    status: PromiseStatus;
  } | null;
  customerBehavior?: PaymentBehavior | null;
  today?: Date;
};

export type PriorityBreakdown = {
  score: number;
  reasons: string[];
};

/**
 * Deterministic collection priority. Higher = chase sooner.
 * Disputed invoices are scored but should be shown in a separate queue in UI.
 */
export function calculatePriorityScore(input: PriorityInput): PriorityBreakdown {
  const today = startOfDay(input.today ?? new Date());
  const reasons: string[] = [];
  let score = 0;

  if (input.status === "DISPUTED") {
    return { score: -1000, reasons: ["Disputed — separate queue"] };
  }

  if (input.status === "PAID" || input.status === "WRITTEN_OFF") {
    return { score: -2000, reasons: ["Closed"] };
  }

  if (input.daysOverdue >= 30) {
    score += 30;
    reasons.push("30+ days overdue (+30)");
  } else if (input.daysOverdue >= 14) {
    score += 20;
    reasons.push("14+ days overdue (+20)");
  } else if (input.daysOverdue >= 7) {
    score += 12;
    reasons.push("7+ days overdue (+12)");
  } else if (input.daysOverdue > 0) {
    score += 8;
    reasons.push("Overdue (+8)");
  } else if (input.status === "DUE_TODAY") {
    score += 10;
    reasons.push("Due today (+10)");
  } else if (input.status === "DUE_SOON") {
    score += 4;
    reasons.push("Due soon (+4)");
  }

  if (input.amountOutstanding >= 2000) {
    score += 20;
    reasons.push("High invoice value (+20)");
  } else if (input.amountOutstanding >= 1000) {
    score += 12;
    reasons.push("Medium-high value (+12)");
  } else if (input.amountOutstanding >= 500) {
    score += 6;
    reasons.push("Medium value (+6)");
  }

  if (!input.hasFollowUp) {
    score += 15;
    reasons.push("No follow-up sent (+15)");
  } else if (input.lastFollowUpAt) {
    const daysSince = daysBetween(input.lastFollowUpAt, today);
    if (daysSince >= 7) {
      score += 10;
      reasons.push("No contact in 7+ days (+10)");
    } else if (daysSince <= 2) {
      score -= 15;
      reasons.push("Recently contacted (−15)");
    }
  }

  if (input.missedPromise) {
    score += 25;
    reasons.push("Missed payment promise (+25)");
  }

  if (
    input.activePromise &&
    input.activePromise.status === "ACTIVE" &&
    startOfDay(input.activePromise.promisedDate) >= today
  ) {
    score -= 8;
    reasons.push("Active promise (−8)");
  }

  if (input.customerBehavior === "FREQUENTLY_LATE") {
    score += 8;
    reasons.push("Frequently late customer (+8)");
  } else if (input.customerBehavior === "SOMETIMES_LATE") {
    score += 3;
    reasons.push("Sometimes late customer (+3)");
  } else if (input.customerBehavior === "USUALLY_ON_TIME") {
    score -= 2;
    reasons.push("Usually on-time customer (−2)");
  }

  return { score, reasons };
}

export function priorityHeat(score: number): "hot" | "warm" | "cool" | "cold" {
  if (score >= 40) return "hot";
  if (score >= 25) return "warm";
  if (score >= 10) return "cool";
  return "cold";
}
